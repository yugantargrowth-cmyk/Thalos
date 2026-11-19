import ThalosApp from "@/components/thalos-app"
import { environments, workspaces, slugify } from "@/lib/thalos-data"

export function generateStaticParams() {
  const params: { segments: string[] }[] = []
  for (const env of environments) {
    const envSlug = slugify(env.name)
    params.push({ segments: [envSlug] })
    for (const ws of workspaces[env.name]) {
      params.push({ segments: [envSlug, slugify(ws)] })
    }
  }
  return params
}

export default async function WorkspaceRoute({ params }: { params: Promise<{ segments: string[] }> }) {
  await params
  return <ThalosApp />
}

