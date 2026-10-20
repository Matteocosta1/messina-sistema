// Solo per il controllo dei tipi con tsc in questo ambiente (su Supabase c'è Deno vero). Non va in deploy.
declare namespace Deno {
  const env: { get(nome: string): string | undefined };
  function serve(h: (r: Request) => Response | Promise<Response>): unknown;
}
