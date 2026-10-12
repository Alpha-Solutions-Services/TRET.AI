-- v0.0.0.35. Not applied from this branch.
-- Adds the truck class for a truck Tolson owns. The value cannot be used
-- until this migration commits, so the unit 3 update is the next file.

alter type public.truck_class add value if not exists 'tolson_owned';
