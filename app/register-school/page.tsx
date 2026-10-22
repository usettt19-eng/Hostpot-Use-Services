import { redirect } from "next/navigation";
import { publicRegistrationOpen } from "@/lib/tenant-deps";
import RegisterSchoolForm from "./form";

export default function RegisterSchoolPage() {
  if (!publicRegistrationOpen()) redirect("/login");
  return <RegisterSchoolForm />;
}
