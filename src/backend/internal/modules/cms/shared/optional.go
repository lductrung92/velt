package shared

import "encoding/json"

// Optional distinguishes a JSON field that was absent from one that was present
// with an explicit null. Set is true only when the key appeared in the payload;
// Value is nil for an explicit null. Used for PATCH fields where "leave
// unchanged" (absent) and "clear" (null) must differ — e.g. moving a category to
// the tree root by sending {"parent_id": null}.
type Optional[T any] struct {
	Set   bool
	Value *T
}

// UnmarshalJSON records that the field was present and captures null vs value.
func (o *Optional[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		o.Value = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	o.Value = &v
	return nil
}
