import { Outlet } from "react-router";

/**
 * Layout route for the jobs area: the board lives at `jobs._index` and the
 * live feed at `jobs.$id`. This parent exists only to give both the shared
 * `/jobs` segment — it renders whichever child matched, nothing else.
 */
export default function JobsLayout() {
  return <Outlet />;
}
