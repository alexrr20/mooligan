# Store collection lots and derive holdings

The collection retains lots so copies with the same card properties can keep
distinct acquisition details, costs, locations, and notes. A holding groups
lots by printing, finish, language, and condition and sums their quantities.
The workspace stores lot properties in relational columns rather than one JSON
payload so SQLite can group, filter, sort, and index them directly. Binders may
later become storage locations without adding binder, page, or slot data to the
first collection version.
