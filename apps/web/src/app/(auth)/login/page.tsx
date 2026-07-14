import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { auth, signIn } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const devAuth = process.env.DEV_AUTH === "true" && process.env.NODE_ENV !== "production";

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">AITIM Group Intranet</CardTitle>
          <CardDescription>Sign in with your work account</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            action={async () => {
              "use server";
              await signIn("microsoft-entra-id", { redirectTo: "/" });
            }}
          >
            <Button type="submit" className="w-full">
              <svg className="mr-2 size-4" viewBox="0 0 21 21" aria-hidden>
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Continue with Microsoft
            </Button>
          </form>

          {devAuth && (
            <form
              className="flex flex-col gap-2 border-t pt-4"
              action={async (formData: FormData) => {
                "use server";
                await signIn("dev", {
                  email: String(formData.get("email") ?? "dev@aitim.local"),
                  redirectTo: "/",
                });
              }}
            >
              <Input name="email" type="email" defaultValue="dev@aitim.local" />
              <Button type="submit" variant="secondary" className="w-full">
                Dev login
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
