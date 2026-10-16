import ReactSelect from "react-select";

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
}

/**
 * The site's dropdown, react-select themed to look like the inputs around it.
 *
 * `unstyled` + `classNamePrefix` is the same arrangement the console uses: the
 * library supplies the behaviour (keyboard, aria, menu positioning) and the
 * stylesheet supplies the looks, so nothing here ships emotion's defaults.
 *
 * Two details matter on an SSR page:
 *
 *  - `instanceId` fixes the generated ids. Without it the server and the
 *    browser invent different ones and React throws the markup away on
 *    hydration.
 *  - `name` makes react-select render a hidden input, so a control inside a
 *    plain <form> is still submitted by the browser the way the native
 *    <select> it replaced was.
 */
export function Select<V extends string = string>({
  id,
  name,
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  /** Also the instance id, so it must be unique and stable on the page. */
  id: string;
  /** Set it when the value is read off a <form> rather than from state. */
  name?: string;
  value: V;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <ReactSelect<SelectOption<V>>
      instanceId={id}
      inputId={id}
      name={name}
      aria-label={ariaLabel}
      className={className ? `site-select ${className}` : "site-select"}
      classNamePrefix="rs"
      unstyled
      isSearchable={false}
      options={options}
      value={options.find((option) => option.value === value) ?? null}
      onChange={(option) => option && onChange(option.value)}
    />
  );
}
