"""RAG tutor, knowledge-base search and source lookup.
Orchestration lives here: db (concept) -> rag (retrieve, context) -> llm (tutor) -> rag (citations)."""
from fastapi import APIRouter

from ..config import get_settings
from ..db import knowledge
from ..db.client import service_client
from ..deps import CurrentUser
from ..errors import ApiError
from ..llm.client import LLMError
from ..llm.prompts import tutor as tutor_prompt
from ..llm.structured import generate
from ..rag.citations import validate_citations
from ..rag.context import build_context
from ..rag.retrieve import Retrieval, RetrievedChunk, retrieve
from ..schemas.ai import TutorLessonLLM, TutorSection
from ..schemas.learning import (
    KbSearchRequest, LessonResponse, LessonSection, RetrievalInfo, SearchHit, SourceRefLite,
    TeachingLesson, TutorLessonRequest,
)
from ..schemas.market import SourceRef

router = APIRouter(prefix="/v1")
EXCERPT = 280


def _excerpt(text: str, n: int = EXCERPT) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "…"


def _cite(sid: str, c: RetrievedChunk) -> SourceRefLite:
    return SourceRefLite(
        source_id=sid, title=c.title, publisher=c.publisher, url=c.source_url, chunk_id=c.chunk_id,
        section_path=c.section_path, excerpt=_excerpt(c.content), content_type=c.content_type,
        published_at=c.published_at,
    )


def _retrieve_for_concept(db, concept: dict, req: TutorLessonRequest) -> Retrieval:
    query = " ".join(filter(None, [concept["name"], concept.get("summary"), req.misconception, req.question]))
    # Misconception teaching: foundation layer only (CLAUDE.md rule 4), concept-filtered first.
    r = retrieve(db, query, layer="foundation", concept_ids=[concept["id"]], level=req.level, k=5)
    if not r.sufficient:
        r = retrieve(db, query, layer="foundation", concept_ids=None, level=req.level,
                     focus_concepts=[concept["id"]], k=5)
    return r


def _fallback_lesson(concept: dict, id_map: dict[str, RetrievedChunk]) -> TutorLessonLLM:
    """Deterministic, extractive: quote the top sources verbatim instead of generating text."""
    if not id_map:
        return TutorLessonLLM(
            sections=[TutorSection(kind="uncertainty", heading="Not enough sourced material",
                                   text=f"I don't have enough sourced material on {concept['name']} to teach it reliably yet.",
                                   source_ids=[])],
            check_question=f"In your own words, what is {concept['name']}?",
            follow_up_question="What would you look up to check your understanding?",
            insufficient_evidence=True,
        )
    sections = [
        TutorSection(kind="supported", heading=(c.section_path or c.title).split(" > ")[-1][:80],
                     text=_excerpt(c.content, 900), source_ids=[sid])
        for sid, c in list(id_map.items())[:3]
    ]
    return TutorLessonLLM(
        sections=sections,
        check_question=f"Summarise {concept['name']} in one or two sentences.",
        follow_up_question=f"How might {concept['name']} show up in today's market moves?",
    )


@router.post("/tutor/lesson", response_model=LessonResponse)
def tutor_lesson(req: TutorLessonRequest, user_id: CurrentUser) -> LessonResponse:
    s = get_settings()
    db = service_client()  # reference data reads only (see ARCHITECTURE.md §4.5)
    concept = knowledge.get_concept(db, req.concept_id)
    if not concept:
        raise ApiError("unknown_concept", f"Unknown concept '{req.concept_id}'", 404)
    try:
        r = _retrieve_for_concept(db, concept, req)
    except Exception as e:  # embedding provider / DB down: teach nothing rather than guess
        raise ApiError("retrieval_unavailable", "Knowledge base is unavailable, try again", 503, True) from e

    context, id_map = build_context(r.chunks if r.sufficient else [])
    generated_by = "llm"
    audit = {"user_id": user_id, "route": "tutor.lesson", "prompt_version": tutor_prompt.PROMPT_VERSION}
    try:
        res = generate(
            TutorLessonLLM, system=tutor_prompt.SYSTEM, model=s.xai_model_fast,
            prompt_version=tutor_prompt.PROMPT_VERSION,
            user=tutor_prompt.build_user(
                concept_name=concept["name"], concept_summary=concept.get("summary"), level=req.level,
                misconception=req.misconception, question=req.question, context=context,
            ),
        )
        llm_lesson = res.value
        knowledge.log_llm_call(db, {**audit, "model": res.model, "latency_ms": res.latency_ms, "ok": True,
                                    "input_tokens": res.input_tokens, "output_tokens": res.output_tokens})
    except LLMError as e:
        llm_lesson, generated_by = _fallback_lesson(concept, id_map), "fallback"
        knowledge.log_llm_call(db, {**audit, "model": s.xai_model_fast, "ok": False, "error": str(e)[:300]})

    clean, used, _ = validate_citations(llm_lesson, set(id_map))
    return LessonResponse(
        lesson=TeachingLesson(
            concept_id=concept["id"], level=req.level,
            sections=[LessonSection(**sec.model_dump()) for sec in clean.sections],
            check_question=clean.check_question, insufficient_evidence=clean.insufficient_evidence,
        ),
        citations=[_cite(sid, id_map[sid]) for sid in id_map if sid in used],
        follow_up=clean.follow_up_question,
        mastery_updates=[],  # mastery is written by the challenge/evaluation flow, not by reading a lesson
        generated_by=generated_by,
        retrieval=RetrievalInfo(chunks_considered=r.considered, top_similarity=r.top_similarity,
                                sufficient=r.sufficient),
    )


@router.post("/kb/search", response_model=list[SearchHit])
def kb_search(req: KbSearchRequest, user_id: CurrentUser) -> list[SearchHit]:
    try:
        r = retrieve(service_client(), req.query, layer=req.layer, concept_ids=req.concept_ids,
                     level=req.level, k=req.k)
    except Exception as e:
        raise ApiError("retrieval_unavailable", "Knowledge base is unavailable, try again", 503, True) from e
    return [
        SearchHit(chunk_id=c.chunk_id, document_id=c.document_id, title=c.title, section_path=c.section_path,
                  excerpt=_excerpt(c.content), similarity=round(c.similarity, 4), score=round(c.score, 4),
                  difficulty=c.difficulty, content_type=c.content_type)
        for c in r.chunks
    ]


@router.get("/sources/{chunk_id}", response_model=SourceRef)
def get_source(chunk_id: str, user_id: CurrentUser) -> SourceRef:
    db = service_client()
    try:
        chunk = knowledge.get_chunk(db, chunk_id)
    except Exception:
        chunk = None  # malformed uuid etc.
    if not chunk or not chunk["is_active"] or chunk["injection_flag"]:
        raise ApiError("not_found", "Source not found", 404)
    doc = knowledge.get_documents(db, [chunk["document_id"]]).get(chunk["document_id"], {})
    return SourceRef(
        source_id=chunk["id"], title=doc.get("title", chunk["document_id"]), publisher=doc.get("publisher") or "",
        url=doc.get("source_url"), published_at=doc.get("published_at"), section_path=chunk.get("section_path"),
        excerpt=_excerpt(chunk["content"], 600), trust_level=doc.get("trust_level") or 4,
    )
