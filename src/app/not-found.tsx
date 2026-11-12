// Endereço que não existe no portal (link antigo, digitado errado, QR velho).
// Antes caía na página padrão do Next em inglês; agora é uma página da Nova,
// com caminho de volta. Funciona sem login e no celular.
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Página não encontrada · Nova Tratores' };

const CSS = `
.nf{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;
  background:#f5f5f4;color:#1c1917;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.nf-card{width:100%;max-width:440px;background:#fefefe;border:1px solid #e7e5e4;border-top:6px solid #dc2626;border-radius:14px;
  padding:28px 22px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.06)}
.nf-logo{width:200px;max-width:70%;height:auto}
.nf h1{font-size:24px;line-height:1.2;margin:18px 0 8px}
.nf p{margin:0 0 20px;color:#57534e;font-size:15px;line-height:1.5}
.nf-acoes{display:flex;flex-direction:column;gap:10px}
.nf-btn{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:10px;font-weight:700;font-size:16px;text-decoration:none}
.nf-pri{background:#dc2626;color:#fefefe}
.nf-sec{border:1px solid #d6d3d1;color:#1c1917;background:#fefefe}
@media (prefers-color-scheme:dark){
  .nf{background:#111111;color:#f5f5f4}
  .nf-card{background:#1c1917;border-color:#292524;border-top-color:#dc2626}
  .nf p{color:#a8a29e}
  .nf-sec{background:#1c1917;color:#f5f5f4;border-color:#44403c}
  .nf-logo{background:#fefefe;border-radius:8px;padding:6px 10px}
}`;

export default function NaoEncontrada() {
  return (
    <main className="nf">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="nf-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="nf-logo" src="/Logo_Nova.png" alt="Nova Tratores" width={1536} height={280} />
        <h1>Página não encontrada</h1>
        <p>O endereço que você abriu não existe ou mudou de lugar. Escolha para onde quer ir:</p>
        <div className="nf-acoes">
          <Link className="nf-btn nf-pri" href="/">Ir para o início do portal</Link>
          <a className="nf-btn nf-sec" href="/garantia">Garantia do trator Mahindra</a>
        </div>
      </div>
    </main>
  );
}
