-- Allow academic papers as a document type.
alter table documents drop constraint documents_content_type_check;
alter table documents add constraint documents_content_type_check
  check (content_type in ('lesson','glossary','interview','news','release','statement','research'));
