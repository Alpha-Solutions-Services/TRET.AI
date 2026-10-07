/** How a truck pays Tolson. Null in the database means not set. */
export type TolsonPayableType = "percent_of_gross" | "fixed_weekly";

export function isTolsonPayableType(value: string | null | undefined): value is TolsonPayableType {
  return value === "percent_of_gross" || value === "fixed_weekly";
}
