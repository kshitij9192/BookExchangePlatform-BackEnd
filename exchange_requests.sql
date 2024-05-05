-- Table: public.exchange_requests

-- DROP TABLE IF EXISTS public.exchange_requests;

CREATE TABLE IF NOT EXISTS public.exchange_requests
(
    request_id integer NOT NULL DEFAULT nextval('exchange_requests_request_id_seq'::regclass),
    lender_id integer NOT NULL,
    requester_id integer NOT NULL,
    book_id integer NOT NULL,
    request_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status text COLLATE pg_catalog."default" DEFAULT 'Pending'::text,
    CONSTRAINT exchange_requests_pkey PRIMARY KEY (request_id),
    CONSTRAINT unique_requester_book UNIQUE (requester_id, book_id),
    CONSTRAINT exchange_requests_book_id_fkey FOREIGN KEY (book_id)
        REFERENCES public.books (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT exchange_requests_lender_id_fkey FOREIGN KEY (lender_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT exchange_requests_requester_id_fkey FOREIGN KEY (requester_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT exchange_requests_status_check CHECK (status = ANY (ARRAY['Pending'::text, 'Accepted'::text, 'Declined'::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.exchange_requests
    OWNER to postgres;