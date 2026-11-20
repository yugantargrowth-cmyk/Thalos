import { supabase } from './supabase'

export async function searchKnowledge(query: string, limit = 5) {
  const { data, error } = await supabase.rpc('search_knowledge', {
    query_text: query,
    match_count: limit
  })

  if (error) {
    console.error('RAG search error:', error)
    return []
  }

  return data as { id: string; title: string; content: string; source: string; category: string }[]
}

export async function buildRAGContext(query: string): Promise<string> {
  const chunks = await searchKnowledge(query)

  if (chunks.length === 0) return ''

  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.content}`)
    .join('\n\n')

  return `Relevant context from Yugantar Growth knowledge base:\n\n${context}\n\n---`
}

export async function ingestDocument( title: string, content: string, source: string, category = 'general' ) {
  const chunkSize = 500
  const chunks: string[] = []

  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize))
  }

  const rows = chunks.map((chunk, i) => ({
    title: `${title} (part ${i + 1})`,
    content: chunk,
    source,
    category
  }))

  const { error } = await supabase.from('knowledge_chunks').insert(rows)
  if (error) throw new Error(`Ingest error: ${error.message}`)

  return { ingested: rows.length }
}
