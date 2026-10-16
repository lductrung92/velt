-- +goose Up
-- A public name that is not the person's legal name.
--
-- `full_name` is what the console shows: an operator picking an assignee or
-- reading an activity row needs to know who that actually is. The site is a
-- different audience — the team did not want their real names on a page the
-- whole internet can read.
--
-- So the two names split. `full_name` stays the record of who somebody is and
-- never leaves the authenticated API; `display_name` is what visitors see.
--
-- NULLABLE, and the public roster falls back to `full_name` when it is empty.
-- That is a deliberate choice with a cost worth stating: a member nobody has
-- given a display name to still shows their real one. The alternative —
-- hiding them, or forcing the field — was weighed and rejected because a
-- missing person on the team page is a worse failure than a visible name.
-- Whoever adds a member is the one who has to fill this in.
--
-- The CHECK rejects a blank string so there is exactly one way to say "not
-- set", which is what lets the fallback be a plain COALESCE.
ALTER TABLE members
    ADD COLUMN display_name TEXT,
    ADD CONSTRAINT members_display_name_check
        CHECK (display_name IS NULL OR btrim(display_name) <> '');

-- +goose Down
ALTER TABLE members
    DROP CONSTRAINT members_display_name_check,
    DROP COLUMN display_name;
