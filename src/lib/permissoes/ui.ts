// Helpers de UI pro padrão "sem permissão": em vez de esconder o botão,
// ele aparece DESABILITADO com um tooltip explicando. Mensagem única aqui
// pra mudar o texto num lugar só.

export const MSG_SEM_PERMISSAO = 'Você não tem permissão para esta ação';

// Props pra mesclar num <button>: desabilita (respeitando um disabled que já
// exista) e mostra o tooltip quando faltar permissão.
//   <button {...gateBtn(podeCriar, salvando)} onClick={...}>
export function gateBtn(pode: boolean, baseDisabled = false): { disabled: boolean; title?: string } {
  return { disabled: !pode || baseDisabled, title: !pode ? MSG_SEM_PERMISSAO : undefined };
}

// Fragmento de estilo inline pro visual "apagado" quando sem permissão.
// Mescle no style do botão: style={{ ...estiloBase, ...estiloSemPermissao(pode) }}
export function estiloSemPermissao(pode: boolean): { opacity?: number; cursor?: string } {
  return pode ? {} : { opacity: 0.5, cursor: 'not-allowed' };
}
