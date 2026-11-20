import { redirect } from "next/navigation";

/** Keep the old reference URL inside the actual KrishiBondhu application. */
export default function LegacyReferenceRedirect() {
  redirect("/");
}
