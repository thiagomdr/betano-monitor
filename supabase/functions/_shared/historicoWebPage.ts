export const HISTORICO_URL_PLACEHOLDER = '__SUPABASE_URL__';
export const HISTORICO_ANON_KEY_PLACEHOLDER = '__SUPABASE_ANON_KEY__';
export const PAINEL_BUILD_ID = 'futebol-placar-final-20260702';

export function buildHistoricoTemplate(): string {
  const configJson = `{"url":"${HISTORICO_URL_PLACEHOLDER}","anonKey":"${HISTORICO_ANON_KEY_PLACEHOLDER}"}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta name="painel-build" content="${PAINEL_BUILD_ID}" />
  <title>Monitor Betano</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #111;
      color: #eee;
      min-height: 100vh;
      line-height: 1.4;
    }
    .header {
      padding: 16px 0 12px;
      border-bottom: 1px solid #222;
      position: sticky;
      top: 0;
      background: #111;
      z-index: 10;
    }
    .title { font-size: 20px; font-weight: 700; color: #fff; flex: 1; min-width: 0; }
    .title-accent { color: #c45c00; }
    .title-home {
      color: #fff;
      text-decoration: none;
    }
    .title-home:hover { text-decoration: underline; }
    .title-link {
      text-decoration: none;
      color: #c45c00;
    }
    .title-link:hover { text-decoration: underline; }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      max-width: 720px;
      margin: 0 auto;
      padding: 0 12px;
      width: 100%;
    }
    .menu-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .menu-kebab {
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 8px;
      padding: 4px;
      color: #fff;
      cursor: pointer;
    }
    .menu-kebab:hover,
    .menu-kebab:active {
      background: transparent;
    }
    .menu-kebab-icon {
      display: block;
      width: 30px;
      height: 30px;
      filter: brightness(0) invert(1);
      transition: filter 0.15s ease;
    }
    .menu-kebab:hover .menu-kebab-icon,
    .menu-kebab:active .menu-kebab-icon {
      filter: brightness(0) saturate(100%) invert(48%) sepia(90%) saturate(2000%) hue-rotate(360deg) brightness(95%);
    }
    .menu-popover {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 188px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 10px;
      padding: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      z-index: 200;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .menu-item {
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      cursor: pointer;
    }
    .menu-item:hover { background: #2a2a2a; }
    a.menu-item {
      display: block;
      text-decoration: none;
      box-sizing: border-box;
    }
    .menu-item-primary { color: #c45c00; }
    .menu-item-danger { color: #ff6b6b; }
    .menu-item-danger:hover { background: #3a2222; }
    .menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
    .menu-info {
      padding: 8px 12px 6px;
    }
    .menu-email {
      font-size: 12px;
      color: #aaa;
      word-break: break-all;
      line-height: 1.4;
    }
    .menu-status {
      font-size: 12px;
      margin-top: 6px;
      color: #7cb342;
      line-height: 1.4;
    }
    .menu-status.off { color: #888; }
    .menu-divider {
      height: 1px;
      background: #333;
      margin: 4px 0;
    }
    button, .btn {
      background: #333;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    button.primary { background: #c45c00; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button.ghost { background: transparent; color: #c45c00; padding: 4px 0; }
    .login-panel {
      max-width: 400px;
      margin: 48px auto;
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .login-panel h2 { font-size: 18px; color: #fff; }
    .login-panel p { font-size: 13px; color: #999; }
    input {
      width: 100%;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 12px;
      color: #fff;
      font-size: 14px;
    }
    input::placeholder { color: #666; }
    .centro {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      gap: 12px;
      text-align: center;
    }
    .aviso { color: #999; font-size: 13px; line-height: 1.5; }
    .erro { color: #ff6b6b; font-size: 13px; }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid #333;
      border-top-color: #c45c00;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .lista {
      padding: 12px;
      padding-bottom: 32px;
      max-width: 720px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    #conteudo {
      width: 100%;
      box-sizing: border-box;
    }
    .card {
      background: #1a1a1a;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 0;
      position: relative;
    }
    .card.ao-vivo { background: #0d2847; }
    .card.feminino { background: #4a1a3a; }
    .card-header {
      display: block;
      cursor: pointer;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      color: inherit;
      padding: 0;
    }
    .expand-icon {
      color: #c45c00;
      font-size: 12px;
      width: 14px;
      flex-shrink: 0;
    }
    .card-corpo { width: 100%; min-width: 0; }
    .card-hora-linha {
      display: flex;
      align-items: center;
      gap: 0;
      flex-wrap: wrap;
      margin-bottom: 8px;
      padding-right: 108px;
    }
    .card-hora {
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      font-family: ui-monospace, monospace;
    }
    .card-periodo {
      font-size: 12px;
      font-weight: 500;
      color: #aaa;
    }
    .card-hora-sep {
      font-size: 13px;
      font-weight: 600;
      color: #888;
      font-family: ui-monospace, monospace;
      margin: 0 0.4em;
    }
    .card.finalizado .card-hora { color: #888; }
    .card.finalizado .card-periodo { color: #666; }
    .card-valores { width: 100%; }
    .card-colunas,
    .card-linha-time {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }
    .card-colunas { margin-bottom: 4px; }
    .card-col-nome,
    .card-nome-time {
      flex: 1;
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .card-nome-texto {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .card-vantagem {
      color: #fff;
      font-weight: 700;
      flex-shrink: 0;
    }
    .card-col-nome { flex: 1; }
    .card-boxes {
      display: flex;
      gap: 8px;
      margin-left: auto;
      flex-shrink: 0;
    }
    .card-col-titulo {
      font-size: 9px;
      font-weight: 600;
      color: #888;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      min-width: 44px;
    }
    .card-linha-time { margin-bottom: 6px; }
    .card.finalizado .card-nome-texto.casa { color: #1a73e8; }
    .card.finalizado .card-nome-texto.fora { color: #c62828; }
    .card-box {
      min-width: 44px;
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      font-family: ui-monospace, monospace;
      flex-shrink: 0;
    }
    .card-box.casa.ao-vivo { background: #1a73e8; color: #fff; }
    .card-box.fora.ao-vivo { background: #c62828; color: #fff; }
    .card-box.finalizado { background: #454545; color: #fff; }
    .card-box.card-box-odd-regra { background: #f5c518; color: #000; }
    .card.finalizado .expand-icon { color: #888; }
    .card-meta { color: #888; font-size: 11px; }
    .card-meta-linha {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
    }
    .card-topo {
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      align-items: center;
      gap: 2px;
      z-index: 5;
    }
    .status-badge {
      position: static;
      font-size: 10px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      line-height: 1.2;
      pointer-events: none;
      flex-shrink: 0;
    }
    .status-badge.ao-vivo {
      background: #1a73e8;
      color: #fff;
    }
    .status-badge.finalizado {
      background: #454545;
      color: #000;
    }
    .card-link-betano {
      font-size: 10px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
      background: #c45c00;
      color: #fff;
      text-decoration: none;
      flex-shrink: 0;
      line-height: 1.2;
    }
    .card-link-betano:hover {
      background: #d96a00;
      color: #fff;
    }
    .card-menu-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .card-menu-kebab {
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      padding: 4px;
      color: #aaa;
      cursor: pointer;
    }
    .card-menu-kebab:hover { background: #2a2a2a; color: #fff; }
    .card-menu-popover {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      min-width: 120px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 10px;
      padding: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      z-index: 30;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .timeline {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .timeline-item { width: 100%; }
    .timeline-coleta {
      width: 100%;
      background: #141414;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      padding: 10px;
      box-sizing: border-box;
    }
    .timeline-hora-linha { padding-right: 0; margin-bottom: 6px; }
    .tela-regras {
      padding: 12px 12px 32px;
      max-width: 720px;
      margin: 0 auto;
    }
    .tela-regras-topo {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .tela-regras-topo h2 {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      flex: 1;
      min-width: 0;
    }
    .btn-voltar-regras {
      background: transparent;
      border: 1px solid #444;
      border-radius: 8px;
      color: #ccc;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 12px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .btn-voltar-regras:hover { color: #fff; border-color: #666; }
    .regras-intro {
      font-size: 13px;
      color: #aaa;
      line-height: 1.55;
      margin-bottom: 20px;
      padding: 12px;
      background: #141414;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
    }
    .regras-secao { margin-bottom: 24px; }
    .regras-secao-titulo {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 10px;
    }
    .regra-item {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 8px;
      padding: 12px;
      background: #141414;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .regra-item-corpo { flex: 1; min-width: 0; }
    .regra-item-nome {
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
      line-height: 1.3;
    }
    .regra-item-detalhe { color: #aaa; line-height: 1.45; }
    .regra-item.inativa { opacity: 0.45; }
    .regra-item-acoes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      width: 100%;
    }
    @media (min-width: 480px) {
      .regra-item-acoes { width: auto; margin-left: auto; flex-wrap: nowrap; }
    }
    .regra-btn {
      background: transparent;
      border: 1px solid #444;
      border-radius: 6px;
      color: #ccc;
      font-size: 11px;
      padding: 6px 10px;
      cursor: pointer;
      white-space: nowrap;
    }
    .regra-btn.editar { color: #c45c00; border-color: #55331a; }
    .regra-btn.excluir { color: #ff6b6b; border-color: #553333; }
    .form-regra {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 16px;
      background: #141414;
      border: 1px solid #2a2a2a;
      border-radius: 10px;
    }
    .form-regra-campo label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #ccc;
      margin-bottom: 6px;
      line-height: 1.4;
    }
    .form-regra-campo .campo-dica {
      display: block;
      font-size: 11px;
      font-weight: 400;
      color: #777;
      margin-top: 4px;
      line-height: 1.4;
    }
    .form-regra select,
    .form-regra input {
      width: 100%;
      background: #111;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 10px 12px;
      color: #fff;
      font-size: 14px;
    }
    .form-regra-acoes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }
    .form-regra-acoes button[type="submit"] {
      flex: 1;
      min-width: 140px;
      background: #c45c00;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-cancelar-edicao {
      background: transparent;
      color: #aaa;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 13px;
      cursor: pointer;
    }
    .card-meta-regra {
      color: #c45c00;
      font-weight: 600;
    }
    .regras-vazio { color: #888; font-size: 13px; padding: 8px 0; line-height: 1.5; }
    .historico-stats-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      max-width: 720px;
      margin: 0 auto;
      padding: 4px 12px 10px;
      border-bottom: 1px solid #222;
      width: 100%;
      box-sizing: border-box;
    }
    .historico-stats-text {
      font-size: 12px;
      color: #888;
      flex: 1;
      min-width: 0;
      line-height: 1.4;
    }
    .abas-historico {
      display: flex;
      gap: 0;
      padding: 0 12px;
      border-bottom: 1px solid #222;
      max-width: 720px;
      margin: 0 auto;
    }
    .aba {
      flex: 1;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #888;
      font-size: 14px;
      font-weight: 600;
      padding: 10px 12px;
      cursor: pointer;
      border-radius: 0;
    }
    .aba:hover { color: #ccc; }
    .aba.ativa {
      color: #fff;
      border-bottom-color: #c45c00;
    }
    .abas-esporte {
      display: flex;
      gap: 8px;
      padding: 10px 12px 0;
      max-width: 720px;
      margin: 0 auto;
    }
    .esporte-btn {
      flex: 1;
      background: #222;
      color: #aaa;
      border: 1px solid #333;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 12px;
      cursor: pointer;
    }
    .esporte-btn:hover { color: #ccc; }
    .esporte-btn.ativa {
      background: #c45c00;
      border-color: #c45c00;
      color: #fff;
    }
    .regra-esporte-rotulo {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      padding: 10px 12px;
      background: #222;
      border: 1px solid #333;
      border-radius: 8px;
    }
    .futebol-secao-titulo {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      margin: 8px 0 4px;
    }
    .futebol-stats-wrap {
      padding: 12px;
      padding-bottom: 32px;
      max-width: 720px;
      margin: 0 auto;
      width: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .futebol-stats-resumo {
      background: #1a1a1a;
      border-radius: 10px;
      padding: 14px;
      line-height: 1.55;
      font-size: 13px;
      color: #ccc;
    }
    .futebol-stats-resumo strong { color: #fff; }
    .futebol-stats-resumo .destaque { color: #c45c00; font-weight: 600; }
    .futebol-tabela-wrap {
      width: 100%;
    }
    .futebol-tabela {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      background: #1a1a1a;
      border-radius: 10px;
      overflow: hidden;
      table-layout: fixed;
    }
    .futebol-tabela th,
    .futebol-tabela td {
      padding: 10px 8px;
      text-align: left;
      border-bottom: 1px solid #2a2a2a;
    }
    .futebol-tabela th {
      color: #999;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }
    .futebol-tabela tr:last-child td { border-bottom: none; }
    .futebol-badge-sim { color: #ff6b6b; font-weight: 600; }
    .futebol-badge-nao { color: #7cb342; font-weight: 600; }
    .futebol-badge-pendente { color: #c45c00; }
    .futebol-historico-lista {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 8px;
    }
    .futebol-historico-partida {
      border-radius: 10px;
      padding: 12px;
      border: 1px solid #2a2a2a;
    }
    .futebol-historico-partida.sem-gol {
      background: #1a2e1a;
      border-color: #2d4a2d;
    }
    .futebol-historico-partida.com-gol {
      background: #2e1a1a;
      border-color: #4a2d2d;
    }
    .futebol-historico-partida.janela,
    .futebol-historico-partida.neutro {
      background: #1a1a1a;
      border-color: #2a2a2a;
    }
    .futebol-historico-toggle {
      cursor: pointer;
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      padding: 0;
      color: inherit;
      font: inherit;
    }
    .futebol-historico-resumo {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 13px;
      line-height: 1.5;
      color: #ccc;
    }
    .futebol-historico-resumo strong { color: #fff; }
    .futebol-time-casa { color: #64b5f6; font-weight: 600; }
    .futebol-time-fora { color: #ef5350; font-weight: 600; }
    .futebol-historico-titulo {
      flex: 1 1 auto;
      min-width: 0;
    }
    .futebol-placar-janela {
      color: #bbb;
      font-weight: 500;
      margin-left: 4px;
    }
    .futebol-historico-resumo-meta {
      font-size: 12px;
      color: #aaa;
      flex: 1 1 100%;
      padding-left: 22px;
    }
    @media (min-width: 600px) {
      .futebol-historico-resumo-meta {
        flex: 1 1 auto;
        padding-left: 0;
      }
    }
    .futebol-historico-detalhe {
      margin-top: 10px;
    }
    .futebol-ao-vivo-secao {
      background: #1a1a1a;
      border-radius: 10px;
      padding: 12px;
      border: 1px solid #2a2a2a;
      margin-bottom: 16px;
    }
    .futebol-ao-vivo-toggle {
      cursor: pointer;
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      padding: 0;
      color: inherit;
      font: inherit;
    }
    .futebol-ao-vivo-cabecalho {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 13px;
      line-height: 1.5;
      color: #ccc;
    }
    .futebol-ao-vivo-cabecalho strong { color: #fff; font-size: 15px; }
    .futebol-ao-vivo-resumo {
      font-size: 12px;
      color: #888;
      flex: 1 1 auto;
    }
    .futebol-ao-vivo-detalhe {
      margin-top: 10px;
    }
    .futebol-historico-cabecalho {
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 10px;
      color: #ccc;
    }
    .futebol-historico-cabecalho strong { color: #fff; }
    .futebol-historico-meta {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
    }
    .futebol-historico-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 6px;
      margin-left: 6px;
      vertical-align: middle;
    }
    .futebol-historico-badge.janela {
      background: #3d2a00;
      color: #ffb74d;
    }
    .futebol-historico-badge.final {
      background: #1a2a1a;
      color: #7cb342;
    }
    .futebol-tabela-leituras {
      font-size: 11px;
      margin-top: 4px;
    }
    .futebol-tabela-leituras th {
      font-size: 10px;
    }
    .futebol-sem-leituras {
      font-size: 12px;
      color: #666;
      margin: 4px 0 0;
    }
    .futebol-mais-gols-sim { color: #ff6b6b; font-weight: 600; }
    @media (min-width: 900px) {
      .header-top,
      .historico-stats-bar,
      .abas-esporte,
      .abas-historico,
      .futebol-stats-wrap,
      .lista {
        max-width: 1100px;
      }
      .lista {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div id="app-login" class="login-panel hidden">
    <h2>Login Supabase</h2>
    <p>Use o mesmo e-mail e senha do monitor Betano.</p>
    <input id="email" type="email" placeholder="E-mail" autocomplete="username" />
    <input id="senha" type="password" placeholder="Senha" autocomplete="current-password" />
    <button id="btn-login" class="primary" type="button">Entrar</button>
    <p id="login-erro" class="erro hidden"></p>
  </div>

  <div id="app-main" class="hidden">
    <header class="header">
      <div class="header-top">
        <div class="title"><a class="title-home" href="./" title="Página inicial do Monitor">Monitor</a> <a class="title-accent title-link" href="https://www.betano.bet.br" target="_blank" rel="noopener noreferrer">Betano</a></div>
        <div class="menu-wrap">
          <button id="btn-menu" type="button" class="menu-kebab" aria-label="Menu" aria-expanded="false" aria-haspopup="true">
            <img class="menu-kebab-icon" src="icons/menu-gear.png" width="30" height="30" alt="" />
          </button>
          <div id="menu-popover" class="menu-popover hidden" role="menu">
            <div class="menu-info">
              <div id="user-email" class="menu-email"></div>
              <div id="monitor-status" class="menu-status off">Coleta: Parada</div>
            </div>
            <div class="menu-divider" role="separator"></div>
            <button id="btn-monitor" class="menu-item" type="button" role="menuitem">Parar Coleta</button>
            <button id="btn-coletar" class="menu-item menu-item-primary" type="button" role="menuitem">Coletar Agora</button>
            <button id="btn-regras-menu" class="menu-item" type="button" role="menuitem">Regras de Alertas</button>
            <button id="btn-sair" class="menu-item" type="button" role="menuitem">Sair</button>
          </div>
        </div>
      </div>
    </header>
    <nav id="abas-esporte" class="abas-esporte hidden" role="tablist" aria-label="Esporte">
      <button id="esporte-basquete" type="button" class="esporte-btn ativa" role="tab" aria-selected="true">Basquete</button>
      <button id="esporte-futebol" type="button" class="esporte-btn" role="tab" aria-selected="false">Futebol</button>
    </nav>
    <nav id="abas-historico" class="abas-historico hidden" role="tablist" aria-label="Histórico">
      <button id="aba-coletas" type="button" class="aba ativa" role="tab" aria-selected="true" aria-controls="conteudo">Coletas</button>
      <button id="aba-alertas" type="button" class="aba" role="tab" aria-selected="false" aria-controls="conteudo">Alertas</button>
    </nav>
    <div id="historico-stats-bar" class="historico-stats-bar hidden">
      <span id="historico-stats" class="historico-stats-text" aria-live="polite"></span>
    </div>
    <div id="conteudo"></div>
    <div id="tela-regras" class="tela-regras hidden" role="region" aria-label="Regras de alerta">
      <div class="tela-regras-topo">
        <button type="button" id="btn-voltar-regras" class="btn-voltar-regras">Voltar</button>
        <h2>Regras de Alertas</h2>
      </div>
      <p class="regras-intro" id="regras-ajuda">
        Cada regra combina <strong>três critérios</strong> para sugerir aposta no <strong>time líder</strong>:
        a partir de qual período vale, vantagem mínima no placar e odd mínima do líder para vencer.
        A cada coleta em que o padrão for detectado, um novo alerta é registrado.
        No <strong>futebol</strong>, a coleta na Betano ocorre apenas nos <strong>últimos 5 minutos do 2º tempo</strong>.
      </p>
      <section class="regras-secao" aria-labelledby="titulo-lista-regras">
        <h3 class="regras-secao-titulo" id="titulo-lista-regras">Minhas regras</h3>
        <div id="lista-regras"></div>
      </section>
      <section class="regras-secao" aria-labelledby="form-regra-titulo">
        <h3 class="regras-secao-titulo" id="form-regra-titulo">Nova regra</h3>
        <form id="form-regra" class="form-regra">
          <div class="form-regra-campo">
            <label for="regra-nome">Nome da regra</label>
            <input id="regra-nome" type="text" maxlength="80" placeholder="Ex.: Líder Q4 confortável" required />
          </div>
          <div class="form-regra-campo">
            <label>Esporte</label>
            <div id="regra-esporte-rotulo" class="regra-esporte-rotulo">Basquete</div>
            <span class="campo-dica">Use os botões Basquete/Futebol no topo do painel para definir o esporte desta regra.</span>
          </div>
          <div class="form-regra-campo">
            <label for="regra-periodo" id="regra-periodo-label">A partir do quarto</label>
            <select id="regra-periodo" required></select>
            <span class="campo-dica" id="regra-periodo-dica">A regra vale neste quarto e nos seguintes (ex.: Q2 inclui Q3 e Q4).</span>
          </div>
          <div class="form-regra-campo">
            <label for="regra-pontos" id="regra-pontos-label">+ Pontos (vantagem mínima)</label>
            <input id="regra-pontos" type="number" min="1" step="1" placeholder="Ex.: 15" required />
            <span class="campo-dica" id="regra-pontos-dica">Diferença de placar entre líder e adversário deve ser ≥ este valor.</span>
          </div>
          <div class="form-regra-campo">
            <label for="regra-odd">ODD mínima do líder</label>
            <input id="regra-odd" type="number" min="0" step="0.01" placeholder="Ex.: 1.10" required />
            <span class="campo-dica">Odd para o time que está na frente vencer a partida (≥ este valor).</span>
          </div>
          <div class="form-regra-acoes">
            <button type="submit" id="btn-salvar-regra">Adicionar regra</button>
            <button type="button" id="btn-cancelar-edicao-regra" class="btn-cancelar-edicao hidden">Cancelar edição</button>
          </div>
        </form>
      </section>
    </div>
  </div>

  <script type="module">
    import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

    const CONFIG = ${configJson};
    const supabase = createClient(CONFIG.url, CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    const PERIODOS_AO_VIVO = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'Intervalo', 'INT', 'HT', 'OT', '1T', '2T']);
    /** Sem nova leitura deste jogo: marca Finalizado (cron não grava coleta com 0 jogos). */
    const JANELA_SEM_ENTRADA_MS = 20 * 60 * 1000;
    const TEXTO_INVALIDO = /não existem mercados|mercados disponíveis|de momento|^unknown$/i;
    const HISTORICO_COLETAS_PAGE = 100;
    const HISTORICO_ALERTAS_PAGE = 100;
    const AUTO_REFRESH_MS = 45_000;
    const CHAVE_COLETA_ATIVADA = 'betano_coleta_ativada_em';
    const CHAVE_COLETA_PARADA = 'betano_coleta_parada_em';
    const CHAVE_ESPORTE_ATIVO = 'betano_esporte_ativo';
    const PAINEL_BUILD_ID = '${PAINEL_BUILD_ID}';

    const OPCOES_PERIODO_BASQUETE = [
      { value: 'Q1', label: 'Q1 — desde o 1º quarto' },
      { value: 'Q2', label: 'Q2 — a partir do 2º quarto' },
      { value: 'Q3', label: 'Q3 — a partir do 3º quarto' },
      { value: 'Q4', label: 'Q4 — a partir do 4º quarto' },
    ];
    const OPCOES_PERIODO_FUTEBOL = [
      { value: '1T', label: '1T — desde o 1º tempo' },
      { value: '2T', label: '2T — a partir do 2º tempo' },
    ];

    const elLogin = document.getElementById('app-login');
    const elMain = document.getElementById('app-main');
    const elConteudo = document.getElementById('conteudo');
    const elHistoricoStatsBar = document.getElementById('historico-stats-bar');
    const elHistoricoStats = document.getElementById('historico-stats');
    const elLoginErro = document.getElementById('login-erro');
    const elUserEmail = document.getElementById('user-email');
    const elMonitorStatus = document.getElementById('monitor-status');
    const elBtnMonitor = document.getElementById('btn-monitor');
    const elBtnColetar = document.getElementById('btn-coletar');
    const elBtnRegrasMenu = document.getElementById('btn-regras-menu');
    const elBtnVoltarRegras = document.getElementById('btn-voltar-regras');
    const elBtnMenu = document.getElementById('btn-menu');
    const elMenuPopover = document.getElementById('menu-popover');
    const elPainelRegras = document.getElementById('tela-regras');
    const elListaRegras = document.getElementById('lista-regras');
    const elFormRegra = document.getElementById('form-regra');
    const elFormRegraTitulo = document.getElementById('form-regra-titulo');
    const elBtnSalvarRegra = document.getElementById('btn-salvar-regra');
    const elBtnCancelarEdicaoRegra = document.getElementById('btn-cancelar-edicao-regra');
    const elAbasHistorico = document.getElementById('abas-historico');
    const elAbaColetas = document.getElementById('aba-coletas');
    const elAbaAlertas = document.getElementById('aba-alertas');
    const elAbasEsporte = document.getElementById('abas-esporte');
    const elEsporteBasquete = document.getElementById('esporte-basquete');
    const elEsporteFutebol = document.getElementById('esporte-futebol');
    const elRegraEsporteRotulo = document.getElementById('regra-esporte-rotulo');
    const elRegraPeriodoLabel = document.getElementById('regra-periodo-label');
    const elRegraPeriodoDica = document.getElementById('regra-periodo-dica');
    const elRegraPontosLabel = document.getElementById('regra-pontos-label');
    const elRegraPontosDica = document.getElementById('regra-pontos-dica');
    const elSelectRegraPeriodo = document.getElementById('regra-periodo');

    let abaAtiva = 'coletas';
    let esporteAtivo = localStorage.getItem(CHAVE_ESPORTE_ATIVO) === 'futebol' ? 'futebol' : 'basquete';
    let telaRegrasAberta = false;
    let regraEmEdicaoId = null;
    let expandidos = new Set();
    let futebolHistoricoExpandidos = new Set();
    let futebolAoVivoSecaoAberta = true;
    let ultimoPayloadFutebol = null;
    let futebolCarregando = false;
    let refreshTimer = null;
    let statusTimer = null;
    let realtimeChannel = null;
    let realtimeDebounce = null;
    let monitorAtivo = false;
    let coletando = false;
    let coletaAtivadaEm = null;
    let coletaParadaEm = null;
    let cardMenuAberto = null;

    const KEBAB_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="5" r="2" fill="currentColor"/>' +
      '<circle cx="12" cy="12" r="2" fill="currentColor"/>' +
      '<circle cx="12" cy="19" r="2" fill="currentColor"/>' +
      '</svg>';

    function lerAtivacaoLocal() {
      const v = localStorage.getItem(CHAVE_COLETA_ATIVADA);
      if (!v) return null;
      const ts = Date.parse(v);
      return Number.isFinite(ts) ? ts : null;
    }

    function lerParadaLocal() {
      const v = localStorage.getItem(CHAVE_COLETA_PARADA);
      if (!v) return null;
      const ts = Date.parse(v);
      return Number.isFinite(ts) ? ts : null;
    }

    function salvarAtivacaoLocal(iso) {
      if (iso) localStorage.setItem(CHAVE_COLETA_ATIVADA, iso);
      else localStorage.removeItem(CHAVE_COLETA_ATIVADA);
    }

    function salvarParadaLocal(iso) {
      if (iso) localStorage.setItem(CHAVE_COLETA_PARADA, iso);
      else localStorage.removeItem(CHAVE_COLETA_PARADA);
    }

    function formatarDuracao(ms) {
      const totalSec = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return (
        String(h).padStart(2, '0') + ':' +
        String(m).padStart(2, '0') + ':' +
        String(s).padStart(2, '0')
      );
    }

    function atualizarTextoStatusMonitor() {
      const inicio = coletaAtivadaEm ?? lerAtivacaoLocal();
      const parada = coletaParadaEm ?? lerParadaLocal();

      if (monitorAtivo) {
        if (!inicio) {
          elMonitorStatus.textContent = 'Coleta: Ativa';
          elMonitorStatus.className = 'menu-status';
          return;
        }
        coletaAtivadaEm = inicio;
        const elapsed = formatarDuracao(Date.now() - inicio);
        elMonitorStatus.textContent = 'Coleta: Ativa (' + elapsed + ')';
        elMonitorStatus.className = 'menu-status';
        return;
      }

      if (inicio && parada) {
        coletaAtivadaEm = inicio;
        coletaParadaEm = parada;
        const elapsed = formatarDuracao(parada - inicio);
        elMonitorStatus.textContent = 'Coleta: Parada (' + elapsed + ')';
        elMonitorStatus.className = 'menu-status off';
        return;
      }

      elMonitorStatus.textContent = 'Coleta: Parada';
      elMonitorStatus.className = 'menu-status off';
    }

    function iniciarTimerStatus() {
      pararTimerStatus();
      atualizarTextoStatusMonitor();
      statusTimer = setInterval(atualizarTextoStatusMonitor, 1000);
    }

    function pararTimerStatus() {
      if (statusTimer) {
        clearInterval(statusTimer);
        statusTimer = null;
      }
    }

    function fecharMenu() {
      elMenuPopover.classList.add('hidden');
      elBtnMenu.setAttribute('aria-expanded', 'false');
    }

    function toggleCardMenu(key) {
      fecharMenu();
      cardMenuAberto = cardMenuAberto === key ? null : key;
      atualizarCardMenusDom();
    }

    function fecharCardMenu() {
      if (!cardMenuAberto) return;
      cardMenuAberto = null;
      atualizarCardMenusDom();
    }

    function atualizarCardMenusDom() {
      elConteudo.querySelectorAll('.card-menu-wrap').forEach((wrap) => {
        const kebab = wrap.querySelector('.card-menu-kebab');
        const pop = wrap.querySelector('.card-menu-popover');
        const key = kebab?.getAttribute('data-key');
        const aberto = Boolean(key && key === cardMenuAberto);
        if (pop) pop.classList.toggle('hidden', !aberto);
        if (kebab) kebab.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      });
    }

    function toggleMenu() {
      const aberto = !elMenuPopover.classList.contains('hidden');
      if (aberto) fecharMenu();
      else {
        fecharCardMenu();
        if (monitorAtivo) atualizarTextoStatusMonitor();
        elMenuPopover.classList.remove('hidden');
        elBtnMenu.setAttribute('aria-expanded', 'true');
      }
    }

    async function obterUsuarioId() {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    }

    function rotuloEsporte(esporte) {
      return esporte === 'futebol' ? 'Futebol' : 'Basquete';
    }

    function jogoEsporte(jogo) {
      return jogo?.esporte === 'futebol' ? 'futebol' : 'basquete';
    }

    function atualizarOpcoesPeriodoRegra() {
      const opcoes = esporteAtivo === 'futebol' ? OPCOES_PERIODO_FUTEBOL : OPCOES_PERIODO_BASQUETE;
      const valorAtual = elSelectRegraPeriodo?.value;
      if (elSelectRegraPeriodo) {
        elSelectRegraPeriodo.innerHTML = opcoes
          .map((o) => '<option value="' + o.value + '">' + escapeHtml(o.label) + '</option>')
          .join('');
        if (valorAtual && opcoes.some((o) => o.value === valorAtual)) {
          elSelectRegraPeriodo.value = valorAtual;
        }
      }
      if (elRegraEsporteRotulo) elRegraEsporteRotulo.textContent = rotuloEsporte(esporteAtivo);
      if (elRegraPeriodoLabel) {
        elRegraPeriodoLabel.textContent = esporteAtivo === 'futebol'
          ? 'A partir do tempo'
          : 'A partir do quarto';
      }
      if (elRegraPeriodoDica) {
        elRegraPeriodoDica.textContent = esporteAtivo === 'futebol'
          ? 'A regra vale neste tempo e no seguinte (ex.: 2T só no 2º tempo).'
          : 'A regra vale neste quarto e nos seguintes (ex.: Q2 inclui Q3 e Q4).';
      }
      if (elRegraPontosLabel) {
        elRegraPontosLabel.textContent = esporteAtivo === 'futebol'
          ? '+ Gols (vantagem mínima)'
          : '+ Pontos (vantagem mínima)';
      }
      if (elRegraPontosDica) {
        elRegraPontosDica.textContent = esporteAtivo === 'futebol'
          ? 'Diferença de gols entre líder e adversário deve ser ≥ este valor.'
          : 'Diferença de placar entre líder e adversário deve ser ≥ este valor.';
      }
    }

    function atualizarAbasEsporteUi() {
      elEsporteBasquete?.classList.toggle('ativa', esporteAtivo === 'basquete');
      elEsporteFutebol?.classList.toggle('ativa', esporteAtivo === 'futebol');
      elEsporteBasquete?.setAttribute('aria-selected', esporteAtivo === 'basquete' ? 'true' : 'false');
      elEsporteFutebol?.setAttribute('aria-selected', esporteAtivo === 'futebol' ? 'true' : 'false');
      atualizarOpcoesPeriodoRegra();
    }

    function trocarEsporte(esporte) {
      if (esporte !== 'basquete' && esporte !== 'futebol') return;
      if (esporteAtivo === esporte && !telaRegrasAberta) return;
      esporteAtivo = esporte;
      localStorage.setItem(CHAVE_ESPORTE_ATIVO, esporteAtivo);
      atualizarAbasEsporteUi();
      if (telaRegrasAberta) {
        limparFormRegra();
        void carregarRegras();
        return;
      }
      void carregar();
    }

    function formatarTextoRegra(r) {
      const odd = Number(r.min_odd).toFixed(2);
      const unidade = (r.esporte ?? 'basquete') === 'futebol' ? 'gols' : 'pts';
      return 'A partir de ' + r.periodo + ' · +' + r.min_pontos + ' ' + unidade + ' · ODD líder ≥ ' + odd;
    }

    function formatarNomeRegraLista(r) {
      return r.nome?.trim() || 'Regra sem nome';
    }

    function atualizarVisibilidadeTelas() {
      elConteudo.classList.toggle('hidden', telaRegrasAberta);
      elPainelRegras?.classList.toggle('hidden', !telaRegrasAberta);
      elHistoricoStatsBar?.classList.toggle('hidden', telaRegrasAberta);
      elAbasHistorico?.classList.toggle('hidden', telaRegrasAberta);
    }

    function abrirTelaRegras() {
      fecharMenu();
      fecharCardMenu();
      telaRegrasAberta = true;
      limparFormRegra();
      atualizarAbasEsporteUi();
      atualizarVisibilidadeTelas();
      void carregarRegras();
    }

    function fecharTelaRegras() {
      telaRegrasAberta = false;
      limparFormRegra();
      atualizarVisibilidadeTelas();
      void carregar();
    }

    function atualizarAbasUi() {
      elAbaColetas?.classList.toggle('ativa', abaAtiva === 'coletas');
      elAbaAlertas?.classList.toggle('ativa', abaAtiva === 'alertas');
      elAbaColetas?.setAttribute('aria-selected', abaAtiva === 'coletas' ? 'true' : 'false');
      elAbaAlertas?.setAttribute('aria-selected', abaAtiva === 'alertas' ? 'true' : 'false');
      atualizarVisibilidadeTelas();
    }

    function trocarAba(aba) {
      if (aba !== 'coletas' && aba !== 'alertas') return;
      if (abaAtiva === aba && !telaRegrasAberta) return;
      abaAtiva = aba;
      telaRegrasAberta = false;
      fecharCardMenu();
      atualizarAbasUi();
      void carregar();
    }

    function atualizarUiFormRegra() {
      const editando = Boolean(regraEmEdicaoId);
      if (elFormRegraTitulo) {
        elFormRegraTitulo.textContent = editando ? 'Editar regra' : 'Nova regra';
      }
      if (elBtnSalvarRegra) {
        elBtnSalvarRegra.textContent = editando ? 'Salvar alterações' : 'Adicionar regra';
      }
      elBtnCancelarEdicaoRegra?.classList.toggle('hidden', !editando);
    }

    function limparFormRegra() {
      regraEmEdicaoId = null;
      elFormRegra?.reset();
      atualizarOpcoesPeriodoRegra();
      atualizarUiFormRegra();
    }

    function iniciarEdicaoRegra(regra) {
      const esporteRegra = regra.esporte === 'futebol' ? 'futebol' : 'basquete';
      if (esporteRegra !== esporteAtivo) {
        esporteAtivo = esporteRegra;
        localStorage.setItem(CHAVE_ESPORTE_ATIVO, esporteAtivo);
        atualizarAbasEsporteUi();
      }
      regraEmEdicaoId = regra.id;
      document.getElementById('regra-nome').value = regra.nome || '';
      atualizarOpcoesPeriodoRegra();
      document.getElementById('regra-periodo').value = regra.periodo;
      document.getElementById('regra-pontos').value = String(regra.min_pontos);
      document.getElementById('regra-odd').value = String(regra.min_odd);
      atualizarUiFormRegra();
      elFormRegraTitulo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderListaRegras(regras) {
      if (!regras.length) {
        elListaRegras.innerHTML = '<p class="regras-vazio">Nenhuma regra cadastrada. Use o formulário abaixo para criar a primeira.</p>';
        return;
      }
      elListaRegras.innerHTML = regras.map((r) => {
        const cls = r.ativo ? 'regra-item' : 'regra-item inativa';
        const esporteTag = rotuloEsporte(r.esporte ?? 'basquete');
        return '<div class="' + cls + '" data-id="' + escapeHtml(r.id) + '">' +
          '<div class="regra-item-corpo">' +
            '<div class="regra-item-nome">' + escapeHtml(formatarNomeRegraLista(r)) + ' · ' + escapeHtml(esporteTag) + '</div>' +
            '<div class="regra-item-detalhe">' + formatarTextoRegra(r) + '</div>' +
          '</div>' +
          '<div class="regra-item-acoes">' +
            '<button type="button" class="regra-btn editar btn-editar-regra" data-id="' + escapeHtml(r.id) + '">Editar</button>' +
            '<button type="button" class="regra-btn btn-toggle-regra" data-id="' + escapeHtml(r.id) + '">' +
              (r.ativo ? 'Desativar' : 'Ativar') +
            '</button>' +
            '<button type="button" class="regra-btn excluir btn-excluir-regra" data-id="' + escapeHtml(r.id) + '">Excluir</button>' +
          '</div>' +
        '</div>';
      }).join('');

      elListaRegras.querySelectorAll('.btn-editar-regra').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const regra = regras.find((x) => x.id === id);
          if (regra) iniciarEdicaoRegra(regra);
        });
      });
      elListaRegras.querySelectorAll('.btn-toggle-regra').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const regra = regras.find((x) => x.id === id);
          if (id && regra) void toggleRegra(id, !regra.ativo);
        });
      });
      elListaRegras.querySelectorAll('.btn-excluir-regra').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (id) void excluirRegra(id);
        });
      });
    }

    function regraEmbedFromAlerta(alerta) {
      const emb = alerta.regras_alerta;
      if (!emb) return null;
      return Array.isArray(emb) ? emb[0] : emb;
    }

    function formatarRegraAlertaResumo(alerta) {
      const regra = regraEmbedFromAlerta(alerta);
      if (!regra) return 'Regra não disponível';
      return formatarTextoRegra(regra);
    }

    function rotuloNomeRegraNoCard(alerta) {
      const regra = regraEmbedFromAlerta(alerta);
      if (regra?.nome?.trim()) return regra.nome.trim();
      return formatarRegraAlertaResumo(alerta);
    }

    function oddsDoAlerta(alerta, jogoColeta) {
      if (jogoColeta) {
        return {
          oddCasa: Number(jogoColeta.odd_casa ?? 0),
          oddFora: Number(jogoColeta.odd_fora ?? 0),
          tempoRestante: jogoColeta.tempo_restante ?? null,
        };
      }
      const oddLider = Number(alerta.odd_lider ?? 0);
      return {
        oddCasa: alerta.time_lider === alerta.time_casa ? oddLider : 0,
        oddFora: alerta.time_lider === alerta.time_fora ? oddLider : 0,
        tempoRestante: null,
      };
    }

    function alertaParaCardView(alerta, jogoColeta, estadoJogoGrupo) {
      const estado = inferirEstadoAlerta(alerta, estadoJogoGrupo);
      const odds = oddsDoAlerta(alerta, jogoColeta);
      const betanoUrl = alerta.url_partida ?? jogoColeta?.url_partida ?? null;
      return {
        disparadoEm: alerta.disparado_em,
        timeCasa: alerta.time_casa,
        timeFora: alerta.time_fora,
        placarCasa: alerta.placar_casa,
        placarFora: alerta.placar_fora,
        oddCasa: odds.oddCasa,
        oddFora: odds.oddFora,
        tempoRestante: odds.tempoRestante,
        timeLider: alerta.time_lider ?? null,
        estado,
        nomeRegra: rotuloNomeRegraNoCard(alerta),
        betanoUrl,
      };
    }

    async function carregarRegras() {
      const usuarioId = await obterUsuarioId();
      if (!usuarioId) return;
      const { data, error } = await supabase
        .from('regras_alerta')
        .select('*')
        .eq('usuario_id', usuarioId)
        .eq('esporte', esporteAtivo)
        .order('ordem', { ascending: true })
        .order('data_criacao', { ascending: true });
      if (error) {
        elListaRegras.innerHTML = '<p class="regras-vazio">' + escapeHtml(error.message) + '</p>';
        return;
      }
      renderListaRegras(data ?? []);
    }

    async function salvarRegra(nome, periodo, minPontos, minOdd) {
      const usuarioId = await obterUsuarioId();
      if (!usuarioId) throw new Error('Faca login primeiro');
      const nomeTrim = nome?.trim();
      if (!nomeTrim) throw new Error('Informe o nome da regra');
      const payload = {
        nome: nomeTrim,
        esporte: esporteAtivo,
        periodo,
        min_pontos: minPontos,
        min_odd: minOdd,
        data_atualizacao: new Date().toISOString(),
      };
      if (regraEmEdicaoId) {
        const { error } = await supabase
          .from('regras_alerta')
          .update(payload)
          .eq('id', regraEmEdicaoId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('regras_alerta').insert({
          usuario_id: usuarioId,
          ...payload,
          ativo: true,
        });
        if (error) throw error;
      }
      limparFormRegra();
      await carregarRegras();
    }

    async function toggleRegra(id, ativo) {
      const { error } = await supabase
        .from('regras_alerta')
        .update({ ativo, data_atualizacao: new Date().toISOString() })
        .eq('id', id);
      if (error) alert(error.message);
      else await carregarRegras();
    }

    async function excluirRegra(id) {
      if (!confirm('Excluir esta regra de alerta?')) return;
      const { error } = await supabase.from('regras_alerta').delete().eq('id', id);
      if (error) alert(error.message);
      else {
        if (regraEmEdicaoId === id) limparFormRegra();
        await carregarRegras();
      }
    }

    async function avaliarAlertasColeta(coletaId) {
      const { data, error } = await supabase.functions.invoke('betano-alertas-avaliar', {
        body: { coletaId },
      });
      if (error) throw new Error(error.message);
      return data;
    }

    async function atualizarStatusMonitor() {
      const { data, error } = await supabase
        .from('coleta_scheduler')
        .select('ativo, last_run_at, next_run_at')
        .eq('id', 'default')
        .maybeSingle();

      if (error || !data) {
        monitorAtivo = false;
        coletaAtivadaEm = lerAtivacaoLocal();
        coletaParadaEm = lerParadaLocal();
        elBtnMonitor.textContent = 'Ativar Coleta';
        pararTimerStatus();
        atualizarTextoStatusMonitor();
        return;
      }

      monitorAtivo = Boolean(data.ativo);
      if (monitorAtivo) {
        coletaAtivadaEm = lerAtivacaoLocal();
        elBtnMonitor.textContent = 'Parar Coleta';
        if (coletaAtivadaEm) iniciarTimerStatus();
        else atualizarTextoStatusMonitor();
      } else {
        coletaAtivadaEm = lerAtivacaoLocal();
        coletaParadaEm = lerParadaLocal();
        elBtnMonitor.textContent = 'Ativar Coleta';
        pararTimerStatus();
        atualizarTextoStatusMonitor();
      }
    }

    async function iniciarMonitorNuvem() {
      const usuarioId = await obterUsuarioId();
      if (!usuarioId) throw new Error('Faca login primeiro');

      const agora = new Date().toISOString();
      const { error } = await supabase.from('coleta_scheduler').upsert({
        id: 'default',
        usuario_id: usuarioId,
        ativo: true,
        next_run_at: agora,
        data_atualizacao: agora,
      });

      if (error) throw error;
      salvarParadaLocal(null);
      coletaParadaEm = null;
      salvarAtivacaoLocal(agora);
      coletaAtivadaEm = Date.parse(agora);
      await atualizarStatusMonitor();
    }

    async function pararMonitorNuvem() {
      const agora = new Date().toISOString();
      const { error } = await supabase
        .from('coleta_scheduler')
        .update({ ativo: false, data_atualizacao: agora })
        .eq('id', 'default');

      if (error) throw error;
      coletaAtivadaEm = lerAtivacaoLocal();
      coletaParadaEm = Date.parse(agora);
      salvarParadaLocal(agora);
      monitorAtivo = false;
      elBtnMonitor.textContent = 'Ativar Coleta';
      pararTimerStatus();
      atualizarTextoStatusMonitor();
    }

    function formatarHora(iso) {
      try {
        return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } catch {
        return iso;
      }
    }

    function buildGameKey(esporte, home, away) {
      const teams = [home, away]
        .map((n) => n.trim().toLowerCase().replace(/\s+/g, ' '))
        .sort();
      return esporte + '|' + teams.join('|');
    }

    function buildGameKeyLegado(home, away) {
      return buildGameKey('basquete', home, away);
    }

    function formatarRotuloVantagem(pc, pf, tc, tf) {
      const diff = Math.abs(pc - pf);
      if (diff === 0) return 'empate';
      const lider = pc > pf ? tc : tf;
      return '+' + diff + ' ' + lider;
    }

    function calcularVantagem(placar, placarOponente) {
      const diff = Number(placar) - Number(placarOponente);
      return diff > 0 ? diff : null;
    }

    function periodoValido(periodo) {
      const p = String(periodo || '').trim();
      return p && !TEXTO_INVALIDO.test(p);
    }

    function sanitizarLiga(liga) {
      if (!liga) return null;
      const t = String(liga).trim();
      return t && !TEXTO_INVALIDO.test(t) ? t : null;
    }

    function isLigaFeminina(liga) {
      if (!liga) return false;
      const t = String(liga).trim();
      return /feminin/i.test(t) || /women/i.test(t) || /\(W\)/i.test(t) || /\bW\b/.test(t);
    }

    function classesCard(estado, liga) {
      const cls = [];
      if (estado === 'finalizado') cls.push('finalizado');
      if (estado === 'ao_vivo') cls.push('ao-vivo');
      if (isLigaFeminina(liga)) cls.push('feminino');
      return cls.length ? ' ' + cls.join(' ') : '';
    }

    function entradaMaisRecente(entradas) {
      return entradas.reduce((a, b) =>
        new Date(a.coletadoEm) > new Date(b.coletadoEm) ? a : b,
      );
    }

    function ultimaEntradaPeriodoValido(entradas) {
      const ord = [...entradas].sort((a, b) => new Date(b.coletadoEm) - new Date(a.coletadoEm));
      return ord.find((e) => periodoValido(e.periodo)) ?? null;
    }

    function coletadoEmDoJogo(jogo) {
      const emb = jogo.coletas_betano;
      if (!emb) return null;
      if (Array.isArray(emb)) return emb[0]?.coletado_em ?? null;
      return emb.coletado_em ?? null;
    }

    function inferirEstadoGrupo(entradas, ultimaColetaGlobalEm) {
      if (!entradas.length) return 'finalizado';
      const ultima = entradaMaisRecente(entradas);
      const idadeEntradaMs = Date.now() - new Date(ultima.coletadoEm).getTime();

      if (ultimaColetaGlobalEm) {
        const tsGlobal = new Date(ultimaColetaGlobalEm).getTime();
        const tsUltima = new Date(ultima.coletadoEm).getTime();
        if (tsUltima < tsGlobal) {
          // #region agent log
          fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H1',location:'inferirEstadoGrupo',message:'finalizado coleta global mais nova',data:{periodo:ultima.periodo,idadeEntradaMs,tsUltima,tsGlobal},timestamp:Date.now(),runId:'post-fix'})}).catch(()=>{});
          // #endregion
          return 'finalizado';
        }
      }

      if (idadeEntradaMs > JANELA_SEM_ENTRADA_MS) {
        // #region agent log
        fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H4',location:'inferirEstadoGrupo',message:'finalizado sem entrada recente',data:{periodo:ultima.periodo,idadeEntradaMs,janelaMs:JANELA_SEM_ENTRADA_MS},timestamp:Date.now(),runId:'post-fix'})}).catch(()=>{});
        // #endregion
        return 'finalizado';
      }

      const ref = ultimaEntradaPeriodoValido(entradas)?.periodo ?? ultima.periodo;
      if (!periodoValido(ref)) return 'finalizado';
      if (/final|fim|ft|encerrado/i.test(String(ref).trim())) return 'finalizado';
      const estado = PERIODOS_AO_VIVO.has(ref.trim()) ? 'ao_vivo' : 'finalizado';
      // #region agent log
      if (estado === 'ao_vivo') fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H2-H3',location:'inferirEstadoGrupo',message:'estado ao_vivo',data:{periodo:ref,idadeEntradaMs},timestamp:Date.now(),runId:'post-fix'})}).catch(()=>{});
      // #endregion
      return estado;
    }

    function formatarPeriodoCard(periodo, estado) {
      if (periodoValido(periodo)) return String(periodo).trim();
      return estado === 'finalizado' ? 'Finalizado' : '—';
    }

    function formatarOddWeb(valor) {
      const n = Number(valor ?? 0);
      if (!Number.isFinite(n) || n <= 0) {
        return '0.0';
      }
      return n.toFixed(2);
    }

    function inferirEstadoEntrada(periodo) {
      if (!periodoValido(periodo)) return 'finalizado';
      return PERIODOS_AO_VIVO.has(periodo.trim()) ? 'ao_vivo' : 'finalizado';
    }

    /** Alertas são eventos passados; segue estado do jogo nas coletas quando disponível. */
    function inferirEstadoAlerta(alerta, estadoJogoGrupo) {
      if (estadoJogoGrupo === 'finalizado') {
        // #region agent log
        fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H1',location:'inferirEstadoAlerta',message:'finalizado via grupo coletas',data:{gameKey:alerta.game_key,periodo:alerta.periodo_atual},timestamp:Date.now(),runId:'post-fix-alertas'})}).catch(()=>{});
        // #endregion
        return 'finalizado';
      }

      const periodo = String(alerta.periodo_atual ?? '').trim();
      if (/final|fim|ft|encerrado/i.test(periodo)) {
        return 'finalizado';
      }
      if (!periodoValido(periodo)) {
        return 'finalizado';
      }

      const disparado = Date.parse(alerta.disparado_em ?? '');
      if (!Number.isFinite(disparado)) {
        return 'finalizado';
      }

      const idadeMs = Date.now() - disparado;
      if (idadeMs > JANELA_SEM_ENTRADA_MS) {
        // #region agent log
        fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H2',location:'inferirEstadoAlerta',message:'finalizado alerta antigo',data:{gameKey:alerta.game_key,periodo,idadeMs},timestamp:Date.now(),runId:'post-fix-alertas'})}).catch(()=>{});
        // #endregion
        return 'finalizado';
      }

      const estado = PERIODOS_AO_VIVO.has(periodo) ? 'ao_vivo' : 'finalizado';
      return estado;
    }

    function menuKeyAlerta(alertaId) {
      return 'alerta:' + alertaId;
    }

    function blocoPeriodoTempo(periodo, tempo, estado) {
      const p = formatarPeriodoCard(periodo, estado);
      if (tempo) return p + ' [ ' + tempo + ' ]';
      return p;
    }

    function montarGrupos(ultimaColetaGlobalEm, jogos) {
      const gruposRaw = new Map();
      let semColetadoEm = 0;

      for (const jogo of jogos) {
        const coletadoEm = coletadoEmDoJogo(jogo);
        if (!coletadoEm) {
          semColetadoEm += 1;
          continue;
        }

        const entrada = {
          id: jogo.id,
          coletadoEm,
          placarCasa: jogo.placar_casa,
          placarFora: jogo.placar_fora,
          periodo: jogo.periodo,
          oddCasa: Number(jogo.odd_casa ?? 0),
          oddFora: Number(jogo.odd_fora ?? 0),
          tempoRestante: jogo.tempo_restante ?? null,
          urlPartida: jogo.url_partida ?? null,
          rotuloVantagem: formatarRotuloVantagem(
            jogo.placar_casa, jogo.placar_fora, jogo.time_casa, jogo.time_fora,
          ),
        };

        const grupoKey = jogo.game_key || buildGameKey(jogoEsporte(jogo), jogo.time_casa, jogo.time_fora);
        const existente = gruposRaw.get(grupoKey);
        if (existente) {
          existente.entradas.push(entrada);
          existente.meta = jogo;
        } else {
          gruposRaw.set(grupoKey, { meta: jogo, entradas: [entrada] });
        }
      }

      const grupos = [];
      for (const [gameKey, { meta, entradas }] of gruposRaw) {
        entradas.sort((a, b) => new Date(b.coletadoEm) - new Date(a.coletadoEm));
        const ultima = entradaMaisRecente(entradas);
        const estado = inferirEstadoGrupo(entradas, ultimaColetaGlobalEm);
        const periodoRef = ultimaEntradaPeriodoValido(entradas)?.periodo ?? ultima.periodo;
        const betanoUrl =
          ultima.urlPartida ??
          entradas.find((e) => e.urlPartida)?.urlPartida ??
          null;
        grupos.push({
          gameKey,
          timeCasa: meta.time_casa,
          timeFora: meta.time_fora,
          liga: sanitizarLiga(meta.liga),
          estado,
          betanoUrl,
          ultimaColetaEm: ultima.coletadoEm,
          ultimoPlacarCasa: ultima.placarCasa,
          ultimoPlacarFora: ultima.placarFora,
          ultimoPeriodo: formatarPeriodoCard(periodoRef, estado),
          ultimoOddCasa: ultima.oddCasa,
          ultimoOddFora: ultima.oddFora,
          ultimoTempoRestante: ultima.tempoRestante ?? null,
          entradas,
        });
      }

      grupos.sort((a, b) => new Date(b.ultimaColetaEm) - new Date(a.ultimaColetaEm));
      const comLink = grupos.filter((g) => g.betanoUrl).length;
      logCardBetanoUrl('H3', 'montarGrupos', 'grupos com url_partida', {
        totalGrupos: grupos.length,
        comLink,
        amostra: grupos.slice(0, 3).map((g) => ({
          gameKey: g.gameKey,
          betanoUrl: g.betanoUrl ?? null,
        })),
      });
      return grupos;
    }

    function rotuloEstado(estado) {
      return estado === 'ao_vivo' ? 'Ao Vivo' : 'Finalizado';
    }

    function renderLinhaTime(nome, odd, placar, placarOponente, lado, aoVivo, forcarCorTime, destacarOddRegra) {
      const clsBox = forcarCorTime
        ? 'card-box ' + lado + ' ao-vivo'
        : (aoVivo ? 'card-box ' + lado + ' ao-vivo' : 'card-box finalizado');
      const clsOdd = destacarOddRegra ? 'card-box card-box-odd-regra' : clsBox;
      const vantagem = calcularVantagem(placar, placarOponente);
      const vantagemHtml = vantagem != null
        ? '<span class="card-vantagem">+' + vantagem + '</span>'
        : '';
      return '<div class="card-linha-time">' +
        '<span class="card-nome-time">' +
          '<span class="card-nome-texto ' + lado + '">' + escapeHtml(nome) + '</span>' +
          vantagemHtml +
        '</span>' +
        '<div class="card-boxes">' +
          '<span class="' + clsBox + '">' + escapeHtml(String(placar)) + '</span>' +
          '<span class="' + clsOdd + '">' + escapeHtml(formatarOddWeb(odd)) + '</span>' +
        '</div>' +
      '</div>';
    }

    function ladoLiderOddDoAlerta(view) {
      const lider = (view.timeLider ?? '').trim();
      if (!lider) return null;
      if (lider === view.timeCasa) return 'casa';
      if (lider === view.timeFora) return 'fora';
      return null;
    }

    function renderValoresJogo(timeCasa, timeFora, oddCasa, oddFora, placarCasa, placarFora, aoVivo, forcarCorTime, ladoLiderOdd) {
      return '<div class="card-valores">' +
          '<div class="card-colunas">' +
            '<span class="card-col-nome"></span>' +
            '<div class="card-boxes">' +
              '<span class="card-col-titulo">Placar</span>' +
              '<span class="card-col-titulo">ODDS</span>' +
            '</div>' +
          '</div>' +
          renderLinhaTime(timeCasa, oddCasa, placarCasa, placarFora, 'casa', aoVivo, forcarCorTime, ladoLiderOdd === 'casa') +
          renderLinhaTime(timeFora, oddFora, placarFora, placarCasa, 'fora', aoVivo, forcarCorTime, ladoLiderOdd === 'fora') +
        '</div>';
    }

    function renderHoraPeriodo(hora, blocoPeriodo, extraClass) {
      const cls = extraClass ? ' card-hora-linha ' + extraClass : ' card-hora-linha';
      return '<div class="' + cls.trim() + '">' +
          '<span class="card-hora">' + escapeHtml(hora) + '</span>' +
          '<span class="card-hora-sep">  -  </span>' +
          '<span class="card-periodo">' + escapeHtml(blocoPeriodo) + '</span>' +
        '</div>';
    }

    function renderCorpoCard(jogo, expandido) {
      const hora = formatarHora(jogo.ultimaColetaEm);
      const aoVivo = jogo.estado === 'ao_vivo';
      const blocoPeriodo = blocoPeriodoTempo(jogo.ultimoPeriodo, jogo.ultimoTempoRestante, jogo.estado);
      return '<div class="card-corpo">' +
        renderHoraPeriodo(hora, blocoPeriodo, '') +
        renderValoresJogo(
          jogo.timeCasa, jogo.timeFora,
          jogo.ultimoOddCasa, jogo.ultimoOddFora,
          jogo.ultimoPlacarCasa, jogo.ultimoPlacarFora,
          aoVivo, false,
        ) +
        '<div class="card-meta-linha">' +
          '<span class="expand-icon">' + (expandido ? '▼' : '▶') + '</span>' +
          '<span class="card-meta">' + escapeHtml(formatarMeta(jogo)) + '</span>' +
        '</div>' +
      '</div>';
    }

    function formatarMeta(j) {
      const n = j.entradas.length;
      return n === 1 ? '1 Coleta' : n + ' Coletas';
    }

    function renderBlocoColeta(entrada, timeCasa, timeFora) {
      const estadoEntrada = inferirEstadoEntrada(entrada.periodo);
      const periodo = periodoValido(entrada.periodo) ? entrada.periodo.trim() : 'Finalizado';
      const blocoPeriodo = blocoPeriodoTempo(periodo, entrada.tempoRestante, estadoEntrada);
      const hora = formatarHora(entrada.coletadoEm);
      return '<div class="timeline-coleta">' +
        renderHoraPeriodo(hora, blocoPeriodo, 'timeline-hora-linha') +
        renderValoresJogo(
          timeCasa, timeFora,
          entrada.oddCasa, entrada.oddFora,
          entrada.placarCasa, entrada.placarFora,
          estadoEntrada === 'ao_vivo', true,
        ) +
      '</div>';
    }

    function renderTimeline(entrada, timeCasa, timeFora) {
      return '<div class="timeline-item">' +
        renderBlocoColeta(entrada, timeCasa, timeFora) +
      '</div>';
    }

    function renderMenuItemAbrirBetano(url) {
      if (!url) return '';
      return '<a class="menu-item menu-item-primary card-menu-abrir-betano" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Abrir na Betano</a>';
    }

    function logCardBetanoUrl(hypothesisId, location, message, data) {
      // #region agent log
      fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '94b3c3' },
        body: JSON.stringify({
          sessionId: '94b3c3',
          hypothesisId,
          location,
          message,
          data,
          timestamp: Date.now(),
          runId: 'menu-betano',
        }),
      }).catch(() => {});
      // #endregion
    }

    function renderCardTopo(jogo) {
      const badgeCls = jogo.estado === 'ao_vivo' ? 'ao-vivo' : 'finalizado';
      const menuAberto = cardMenuAberto === jogo.gameKey;
      const temLink = Boolean(jogo.betanoUrl);
      logCardBetanoUrl('H4', 'renderCardTopo', 'card coleta menu betano', {
        gameKey: jogo.gameKey,
        temLink,
        betanoUrl: temLink ? jogo.betanoUrl : null,
      });
      const popoverCls = menuAberto ? '' : ' hidden';
      const linkItem = renderMenuItemAbrirBetano(jogo.betanoUrl);
      return '<div class="card-topo">' +
        '<span class="status-badge ' + badgeCls + '">' + escapeHtml(rotuloEstado(jogo.estado)) + '</span>' +
        '<div class="card-menu-wrap">' +
          '<button type="button" class="card-menu-kebab" data-key="' + escapeHtml(jogo.gameKey) + '" aria-label="Opcoes do jogo" aria-expanded="' + (menuAberto ? 'true' : 'false') + '">' +
            KEBAB_SVG +
          '</button>' +
          '<div class="card-menu-popover' + popoverCls + '">' +
            linkItem +
            '<button type="button" class="menu-item menu-item-danger card-btn-excluir" data-key="' + escapeHtml(jogo.gameKey) + '">Excluir</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function renderCard(jogo) {
      const exp = expandidos.has(jogo.gameKey);
      const timeline = exp
        ? '<div class="timeline">' + jogo.entradas.map((e) => renderTimeline(e, jogo.timeCasa, jogo.timeFora)).join('') + '</div>'
        : '';

      const clsCard = classesCard(jogo.estado, jogo.liga);

      return '<article class="card' + clsCard + '">' +
        renderCardTopo(jogo) +
        '<button type="button" class="card-header" data-key="' + escapeHtml(jogo.gameKey) + '">' +
          renderCorpoCard(jogo, exp) +
        '</button>' +
        timeline + '</article>';
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    async function executarColetaFutebolRadar() {
      const { data, error } = await supabase.functions.invoke('betano-coleta', { body: {} });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Resposta vazia da coleta');
      if (data.blocked) throw new Error(data.summary || 'Bloqueio provável na Betano');
      return data;
    }

    function rotuloPeriodoFutebol(periodo) {
      if (periodo === '1T') return '1º tempo';
      if (periodo === '2T') return '2º tempo';
      if (periodo === 'INT') return 'Intervalo';
      if (periodo === 'FT') return 'Final';
      return null;
    }

    function formatarTempoJogo(p) {
      const tempo = p.tempo_decorrido?.trim() || p.minuto_relogio?.trim();
      const periodo = rotuloPeriodoFutebol(p.periodo_atual);
      if (tempo && periodo) return tempo + ' · ' + periodo;
      if (tempo) return tempo;
      if (periodo) return periodo;
      return '—';
    }

    function formatarRestanteAte85(minutos) {
      if (minutos == null || !Number.isFinite(Number(minutos))) return '—';
      const n = Math.round(Number(minutos));
      if (n <= 0) return '≤ 85\'';
      const h = Math.floor(n / 60);
      const m = n % 60;
      if (h > 0) return '~' + h + 'h ' + m + ' min';
      return '~' + n + ' min';
    }

    async function buscarEstatisticasFutebol() {
      const [{ data: partidas, error }, { data: agenda }] = await Promise.all([
        supabase
          .from('futebol_partidas')
          .select('*')
          .order('data_atualizacao', { ascending: false })
          .limit(300),
        supabase.from('futebol_agenda').select('modo, next_fetch_at, last_radar_at, last_intensive_at').maybeSingle(),
      ]);
      if (error) throw new Error(error.message);
      const lista = partidas ?? [];
      const finalizadas = lista.filter((p) => p.status === 'finalizado');
      const comGol = finalizadas.filter((p) => p.gol_nos_ultimos_5_min === true);
      const semGol = finalizadas.filter((p) => p.gol_nos_ultimos_5_min === false);
      const emJanela = lista.filter((p) => p.status === 'em_janela').length;
      const observadas = lista.filter((p) => p.status === 'observado').length;
      const historicoJanela = lista.filter((p) => p.status === 'em_janela' || p.status === 'finalizado');
      const partidaIds = historicoJanela.map((p) => p.id);

      let leituras = [];
      if (partidaIds.length > 0) {
        const { data: leiturasData, error: leiturasError } = await supabase
          .from('futebol_leituras')
          .select('*')
          .in('partida_id', partidaIds)
          .order('coletado_em', { ascending: true });
        if (leiturasError) throw new Error(leiturasError.message);
        leituras = leiturasData ?? [];
      }

      const leiturasPorPartida = {};
      for (const leitura of leituras) {
        const pid = leitura.partida_id;
        if (!leiturasPorPartida[pid]) leiturasPorPartida[pid] = [];
        leiturasPorPartida[pid].push(leitura);
      }

      return {
        partidas: lista,
        historicoJanela,
        leiturasPorPartida,
        agenda: agenda ?? null,
        stats: {
          finalizadas: finalizadas.length,
          comGol: comGol.length,
          semGol: semGol.length,
          pctComGol: finalizadas.length
            ? Math.round((1000 * comGol.length) / finalizadas.length) / 10
            : null,
          emJanela,
          observadas,
        },
      };
    }

    function rotuloGolUltimos5(valor) {
      if (valor === true) return '<span class="futebol-badge-sim">Sim</span>';
      if (valor === false) return '<span class="futebol-badge-nao">Não</span>';
      return '<span class="futebol-badge-pendente">—</span>';
    }

    function formatarDataCurta(iso) {
      if (!iso) return '—';
      try {
        return new Date(iso).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
      } catch {
        return iso;
      }
    }

    function formatarDataComSegundos(iso) {
      if (!iso) return '—';
      try {
        return new Date(iso).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
      } catch {
        return iso;
      }
    }

    function normalizarJogoAoVivoJson(j) {
      return {
        time_casa: j.homeTeam,
        time_fora: j.awayTeam,
        liga: j.league,
        placar_casa_atual: j.homeScore,
        placar_fora_atual: j.awayScore,
        tempo_decorrido: j.tempoDecorrido || j.periodDescription || (j.matchMinute != null ? j.matchMinute + "'" : null),
        minuto_relogio: j.periodDescription || j.tempoDecorrido || (j.matchMinute != null ? j.matchMinute + "'" : null),
        periodo_atual: j.period,
        minutos_ate_85: j.minutesUntil85,
        eta_85: j.eta85,
        em_janela: Boolean(j.inFinalWindow),
      };
    }

    function normalizarJogoAoVivoDb(p) {
      return {
        time_casa: p.time_casa,
        time_fora: p.time_fora,
        liga: p.liga,
        placar_casa_atual: p.placar_casa_atual,
        placar_fora_atual: p.placar_fora_atual,
        tempo_decorrido: p.minuto_relogio,
        minuto_relogio: p.minuto_relogio,
        periodo_atual: p.periodo_atual,
        minutos_ate_85: p.minutos_ate_85,
        eta_85: p.eta_85,
        em_janela: p.status === 'em_janela',
      };
    }

    function ordenarJogosAoVivo(lista) {
      return [...lista].sort((a, b) => {
        const ja = a.em_janela ? 0 : 1;
        const jb = b.em_janela ? 0 : 1;
        if (ja !== jb) return ja - jb;
        const ma = Number(a.minutos_ate_85);
        const mb = Number(b.minutos_ate_85);
        if (Number.isFinite(ma) && Number.isFinite(mb) && ma !== mb) return ma - mb;
        if (Number.isFinite(ma) && !Number.isFinite(mb)) return -1;
        if (!Number.isFinite(ma) && Number.isFinite(mb)) return 1;
        return (a.time_casa + a.time_fora).localeCompare(b.time_casa + b.time_fora, 'pt-BR');
      });
    }

    function renderTabelaAoVivoFutebol(aoVivo, secaoAberta) {
      if (!aoVivo.length) {
        return '<section class="futebol-ao-vivo-secao">' +
          '<div class="futebol-ao-vivo-cabecalho"><strong>Jogos ao vivo</strong>' +
          '<span class="futebol-ao-vivo-resumo">Nenhum jogo FOOT no JSON</span></div>' +
        '</section>';
      }
      const emJanela = aoVivo.filter((p) => p.em_janela).length;
      const resumoTxt = aoVivo.length + ' jogo(s)' +
        (emJanela > 0 ? ' · ' + emJanela + ' em janela' : '') +
        ' · clique para ' + (secaoAberta ? 'recolher' : 'expandir');
      const detalheCls = secaoAberta ? '' : ' hidden';
      const linhas = aoVivo.map((p) => {
        const placar = (p.placar_casa_atual != null && p.placar_fora_atual != null)
          ? p.placar_casa_atual + '–' + p.placar_fora_atual
          : '—';
        const status = p.em_janela ? 'Em janela (≥85\')' : 'Ao vivo';
        return '<tr>' +
          '<td>' + escapeHtml(p.time_casa) + ' x ' + escapeHtml(p.time_fora) + '</td>' +
          '<td>' + escapeHtml(p.liga || '—') + '</td>' +
          '<td>' + escapeHtml(formatarTempoJogo(p)) + '</td>' +
          '<td>' + escapeHtml(placar) + '</td>' +
          '<td>' + escapeHtml(formatarRestanteAte85(p.minutos_ate_85)) + '</td>' +
          '<td>' + escapeHtml(formatarDataCurta(p.eta_85)) + '</td>' +
          '<td>' + escapeHtml(status) + '</td>' +
        '</tr>';
      }).join('');
      return '<section class="futebol-ao-vivo-secao">' +
        '<button type="button" class="futebol-ao-vivo-toggle" aria-expanded="' + (secaoAberta ? 'true' : 'false') + '">' +
          '<div class="futebol-ao-vivo-cabecalho">' +
            '<span class="expand-icon">' + (secaoAberta ? '▼' : '▶') + '</span>' +
            '<strong>Jogos ao vivo</strong>' +
            '<span class="futebol-ao-vivo-resumo">' + escapeHtml(resumoTxt) + '</span>' +
          '</div>' +
        '</button>' +
        '<div class="futebol-ao-vivo-detalhe' + detalheCls + '">' +
          '<p style="color:#888;font-size:12px;margin:0 0 8px">Todos os jogos FOOT do JSON Betano, em qualquer minuto. Coleta ao abrir Futebol ou Coletar Agora.</p>' +
          '<div class="futebol-tabela-wrap"><table class="futebol-tabela"><thead><tr>' +
          '<th>Partida</th><th>Liga</th><th>Tempo de jogo</th><th>Placar</th><th>Restante até 85\'</th><th>ETA ~85\'</th><th>Status</th>' +
          '</tr></thead><tbody>' + linhas + '</tbody></table></div>' +
        '</div>' +
      '</section>';
    }

    function wireFutebolAoVivoToggle() {
      elConteudo.querySelectorAll('.futebol-ao-vivo-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          futebolAoVivoSecaoAberta = !futebolAoVivoSecaoAberta;
          if (ultimoPayloadFutebol) renderEstatisticasFutebol(ultimoPayloadFutebol);
        });
      });
    }

    function totalGolsPartida(casa, fora) {
      return Number(casa ?? 0) + Number(fora ?? 0);
    }

    function calcularMaisGolsLeitura(leitura, anterior, placarCasaInicio, placarForaInicio) {
      const atual = totalGolsPartida(leitura.placar_casa, leitura.placar_fora);
      const referencia = anterior
        ? totalGolsPartida(anterior.placar_casa, anterior.placar_fora)
        : (placarCasaInicio != null && placarForaInicio != null
          ? totalGolsPartida(placarCasaInicio, placarForaInicio)
          : null);
      if (referencia == null) return '—';
      const delta = atual - referencia;
      if (delta === 0) return '0';
      return '+' + delta;
    }

    function formatarOddManter(valor) {
      if (valor == null || !Number.isFinite(Number(valor)) || Number(valor) <= 0) return '—';
      return Number(valor).toFixed(2);
    }

    function formatarPlacarIxF(casa, fora) {
      if (casa == null || fora == null) return '—';
      return casa + 'x' + fora;
    }

    function ordenarHistoricoJanela(lista) {
      return [...lista].sort((a, b) => {
        const ja = a.status === 'em_janela' ? 0 : 1;
        const jb = b.status === 'em_janela' ? 0 : 1;
        if (ja !== jb) return ja - jb;
        const da = new Date(a.finalizado_em ?? a.data_atualizacao ?? 0).getTime();
        const db = new Date(b.finalizado_em ?? b.data_atualizacao ?? 0).getTime();
        return db - da;
      });
    }

    function renderTabelaLeiturasPartida(partida, leituras) {
      if (!leituras.length) {
        return '<p class="futebol-sem-leituras">Nenhuma coleta intensiva registrada nesta janela ainda.</p>';
      }
      const linhas = leituras.map((l, idx) => {
        const anterior = idx > 0 ? leituras[idx - 1] : null;
        const maisGols = calcularMaisGolsLeitura(
          l, anterior, partida.placar_casa_inicio, partida.placar_fora_inicio,
        );
        const clsGol = String(maisGols).startsWith('+') ? ' class="futebol-mais-gols-sim"' : '';
        const placar = l.placar_casa + '–' + l.placar_fora;
        return '<tr>' +
          '<td>' + escapeHtml(formatarDataComSegundos(l.coletado_em)) + '</td>' +
          '<td>' + escapeHtml(l.minuto_relogio?.trim() || '—') + ' <span style="color:#666">(' + escapeHtml(placar) + ')</span></td>' +
          '<td' + clsGol + '>' + escapeHtml(maisGols) + '</td>' +
          '<td>' + escapeHtml(formatarOddManter(l.odd_manter_placar)) + '</td>' +
        '</tr>';
      }).join('');
      return '<div class="futebol-tabela-wrap"><table class="futebol-tabela futebol-tabela-leituras"><thead><tr>' +
        '<th>Data/Hora</th><th>Tempo de jogo</th><th>+Gols</th><th>ODD manter</th>' +
        '</tr></thead><tbody>' + linhas + '</tbody></table></div>';
    }

    function classeResultadoFutebol(partida) {
      if (partida.status === 'em_janela') return 'janela';
      if (partida.gol_nos_ultimos_5_min === true) return 'com-gol';
      if (partida.gol_nos_ultimos_5_min === false) return 'sem-gol';
      return 'neutro';
    }

    function renderBlocoPartidaHistorico(partida, leituras, expandido) {
      const emJanela = partida.status === 'em_janela';
      const badgeCls = emJanela ? 'janela' : 'final';
      const badgeTxt = emJanela ? 'Em janela' : 'Finalizado';
      const placarI = formatarPlacarIxF(partida.placar_casa_inicio, partida.placar_fora_inicio);
      let placarF = formatarPlacarIxF(partida.placar_casa_final, partida.placar_fora_final);
      if (placarF === '—' && leituras.length > 0) {
        const ult = leituras[leituras.length - 1];
        placarF = formatarPlacarIxF(ult.placar_casa, ult.placar_fora);
      }
      const resultadoCls = classeResultadoFutebol(partida);
      const detalheCls = expandido ? '' : ' hidden';
      const tituloLinha =
        '<span class="futebol-time-casa">' + escapeHtml(partida.time_casa) + '</span>' +
        ' <span style="color:#888">x</span> ' +
        '<span class="futebol-time-fora">' + escapeHtml(partida.time_fora) + '</span>' +
        ' <span class="futebol-historico-badge ' + badgeCls + '">' + badgeTxt + '</span>' +
        ' <span class="futebol-placar-janela">I:' + escapeHtml(placarI) + ' / F:' + escapeHtml(placarF) + '</span>';
      const resumoMeta = '<span class="futebol-historico-resumo-meta">' +
        (partida.liga ? escapeHtml(partida.liga) + ' · ' : '') +
        escapeHtml(leituras.length + ' coleta(s)') + '</span>';
      return '<article class="futebol-historico-partida ' + resultadoCls + '">' +
        '<button type="button" class="futebol-historico-toggle" data-partida-id="' + escapeHtml(partida.id) + '" aria-expanded="' + (expandido ? 'true' : 'false') + '">' +
          '<div class="futebol-historico-resumo">' +
            '<span class="expand-icon">' + (expandido ? '▼' : '▶') + '</span>' +
            '<span class="futebol-historico-titulo">' + tituloLinha + '</span>' +
            resumoMeta +
          '</div>' +
        '</button>' +
        '<div class="futebol-historico-detalhe' + detalheCls + '">' +
          renderTabelaLeiturasPartida(partida, leituras) +
        '</div>' +
      '</article>';
    }

    function wireFutebolHistoricoToggle() {
      const toggles = elConteudo.querySelectorAll('.futebol-historico-toggle');
      const detalhesOcultos = elConteudo.querySelectorAll('.futebol-historico-detalhe.hidden').length;
      // #region agent log
      fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '94b3c3' },
        body: JSON.stringify({
          sessionId: '94b3c3',
          runId: 'futebol-collapse-debug',
          hypothesisId: 'H1-H2-H4',
          location: 'historicoWebPage.ts:wireFutebolHistoricoToggle',
          message: 'toggle wiring',
          data: {
            buildId: PAINEL_BUILD_ID,
            toggleCount: toggles.length,
            detalhesOcultos,
            hasPayload: ultimoPayloadFutebol != null,
            expandidosCount: futebolHistoricoExpandidos.size,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      toggles.forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-partida-id');
          if (!id) return;
          const eraExpandido = futebolHistoricoExpandidos.has(id);
          if (eraExpandido) futebolHistoricoExpandidos.delete(id);
          else futebolHistoricoExpandidos.add(id);
          // #region agent log
          fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '94b3c3' },
            body: JSON.stringify({
              sessionId: '94b3c3',
              runId: 'futebol-collapse-debug',
              hypothesisId: 'H3-H5',
              location: 'historicoWebPage.ts:wireFutebolHistoricoToggle:click',
              message: 'toggle click',
              data: {
                partidaId: id,
                eraExpandido,
                agoraExpandido: futebolHistoricoExpandidos.has(id),
                hasPayload: ultimoPayloadFutebol != null,
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          if (ultimoPayloadFutebol) renderEstatisticasFutebol(ultimoPayloadFutebol);
        });
      });
    }

    function renderTabelaHistoricoFutebol(historicoJanela, leiturasPorPartida) {
      const lista = ordenarHistoricoJanela(historicoJanela);
      if (!lista.length) {
        return '<p class="aviso" style="margin-top:12px">Nenhuma partida na janela final ainda. Com o monitor ativo, jogos ≥85\' aparecem aqui com coletas a cada 40–50 s.</p>';
      }
      const blocos = lista.map((p) => {
        const leituras = leiturasPorPartida[p.id] ?? [];
        const expandido = futebolHistoricoExpandidos.has(p.id);
        return renderBlocoPartidaHistorico(p, leituras, expandido);
      }).join('');
      return '<h3 class="futebol-secao-titulo">Histórico — janela final (85\' até o fim)</h3>' +
        '<p style="color:#888;font-size:12px;margin:0 0 8px">Clique no jogo para ver as coletas. Verde = sem gol nos 5 min · Vermelho = com gol.</p>' +
        '<div class="futebol-historico-lista">' + blocos + '</div>';
    }

    async function aplicarPainelFutebol(dados, aoVivoJson) {
      atualizarStatsHistorico({
        futebolFinalizadas: dados.stats.finalizadas,
        futebolPctGol: dados.stats.pctComGol,
        futebolAoVivo: aoVivoJson.length,
      });
      ultimoPayloadFutebol = { ...dados, aoVivoJson };
      renderEstatisticasFutebol(ultimoPayloadFutebol);
    }

    async function carregarFutebol(silencioso) {
      if (futebolCarregando) return;
      futebolCarregando = true;
      try {
        let aoVivoJson = ultimoPayloadFutebol?.aoVivoJson ?? [];
        if (!silencioso) {
          const coleta = await executarColetaFutebolRadar();
          aoVivoJson = Array.isArray(coleta.footballRadar) ? coleta.footballRadar : [];
        }
        const dados = await buscarEstatisticasFutebol();
        // #region agent log
        fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '94b3c3' },
          body: JSON.stringify({
            sessionId: '94b3c3',
            runId: 'futebol-intervalo-debug',
            hypothesisId: 'H1-H3',
            location: 'historicoWebPage.ts:carregarFutebol',
            message: 'futebol load path',
            data: {
              buildId: PAINEL_BUILD_ID,
              silencioso,
              chamouColeta: !silencioso,
              aoVivoCount: aoVivoJson.length,
              futebolSync: !silencioso ? 'betano-coleta' : 'db-only',
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        await aplicarPainelFutebol(dados, aoVivoJson);
      } finally {
        futebolCarregando = false;
      }
    }

    function renderEstatisticasFutebol(payload) {
      const { partidas, agenda, stats, aoVivoJson, historicoJanela, leiturasPorPartida } = payload;
      const aoVivo = ordenarJogosAoVivo(
        Array.isArray(aoVivoJson) && aoVivoJson.length
          ? aoVivoJson.map(normalizarJogoAoVivoJson)
          : partidas
            .filter((p) => p.status === 'observado' || p.status === 'em_janela')
            .map(normalizarJogoAoVivoDb),
      );
      const historico = historicoJanela ?? partidas.filter((p) => p.status === 'em_janela' || p.status === 'finalizado');
      const leiturasMap = leiturasPorPartida ?? {};
      const pct = stats.pctComGol != null
        ? stats.pctComGol + '% das partidas finalizadas tiveram gol nos últimos 5 min'
        : 'Aguardando partidas finalizadas para calcular a estatística';
      const agendaTxt = agenda?.next_fetch_at
        ? 'Próxima coleta futebol: ' + formatarDataCurta(agenda.next_fetch_at) + ' (' + (agenda.modo ?? 'radar') + ')'
        : 'Radar ativo após iniciar o monitor (coleta basquete atualiza a agenda).';

      const resumo = '<div class="futebol-stats-resumo">' +
        '<p><strong>Pesquisa:</strong> aposta em <em>não ter gol</em> nos últimos 5 minutos (85\' até o fim, com acréscimos).</p>' +
        '<p class="destaque">' + escapeHtml(pct) + '</p>' +
        '<p>' + aoVivo.length + ' ao vivo · ' + stats.emJanela + ' em janela · ' +
        stats.finalizadas + ' finalizada(s) · ' + stats.comGol + ' com gol · ' + stats.semGol + ' sem gol</p>' +
        '<p style="color:#888;margin-top:8px">' + escapeHtml(agendaTxt) + '</p>' +
        '<p style="color:#888;margin-top:4px">Intensivo em lote (40–50 s) só na janela final. Estatística abaixo.</p>' +
        '<p style="color:#555;font-size:10px;margin-top:4px">Build: ' + escapeHtml(PAINEL_BUILD_ID) + '</p>' +
      '</div>';

      elConteudo.innerHTML = '<div class="futebol-stats-wrap">' + resumo +
        renderTabelaAoVivoFutebol(aoVivo, futebolAoVivoSecaoAberta) +
        renderTabelaHistoricoFutebol(historico, leiturasMap) +
      '</div>';
      wireFutebolAoVivoToggle();
      wireFutebolHistoricoToggle();
      // #region agent log
      requestAnimationFrame(() => {
        const wrap = elConteudo.querySelector('.futebol-stats-wrap');
        const table = elConteudo.querySelector('.futebol-tabela');
        const abas = document.getElementById('abas-esporte');
        const abasRect = abas?.getBoundingClientRect();
        const wrapRect = wrap?.getBoundingClientRect();
        const tableRect = table?.getBoundingClientRect();
        const payload = {
          sessionId: '94b3c3',
          runId: 'layout-debug',
          hypothesisId: 'H1-H4',
          location: 'historicoWebPage.ts:renderEstatisticasFutebol',
          message: 'futebol layout metrics',
          data: {
            buildId: PAINEL_BUILD_ID,
            viewportW: window.innerWidth,
            abasW: abasRect?.width ?? null,
            wrapW: wrapRect?.width ?? null,
            tableW: tableRect?.width ?? null,
            colHeaders: table ? Array.from(table.querySelectorAll('th')).map((th) => th.textContent) : [],
            aoVivoCount: aoVivo.length,
          },
          timestamp: Date.now(),
        };
        fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '94b3c3' },
          body: JSON.stringify(payload),
        }).catch(() => {});
      });
      // #endregion
    }

    function renderLoading() {
      elConteudo.innerHTML = '<div class="centro"><div class="spinner"></div></div>';
    }

    function renderErro(msg) {
      elConteudo.innerHTML = '<div class="centro"><p class="erro">' + escapeHtml(msg) + '</p>' +
        '<button type="button" id="btn-retry">Tentar novamente</button></div>';
      document.getElementById('btn-retry')?.addEventListener('click', () => void carregar());
    }

    function renderVazio(motivo) {
      const padrao = esporteAtivo === 'futebol'
        ? 'Nenhuma partida monitorada ainda. Com o monitor ativo, o radar agenda coletas nos últimos 5 minutos (85\' até o apito final, incluindo acréscimos).'
        : 'Nenhum jogo registrado ainda. Use Ativar Coleta ou Coletar Agora quando houver basquete ao vivo na Betano.';
      const msg = motivo || padrao;
      elConteudo.innerHTML = '<div class="centro"><p class="aviso">' + escapeHtml(msg) + '</p></div>';
    }

    function renderVazioAlertas() {
      const esporte = rotuloEsporte(esporteAtivo);
      elConteudo.innerHTML = '<div class="centro"><p class="aviso">Nenhum alerta de ' + escapeHtml(esporte) +
        ' disparado ainda. Configure regras em Regras de Alertas no menu e aguarde um jogo que atenda aos critérios.</p></div>';
    }

    function renderAlertaCardTopo(estado, menuKey, betanoUrl) {
      const badgeCls = estado === 'ao_vivo' ? 'ao-vivo' : 'finalizado';
      const menuAberto = cardMenuAberto === menuKey;
      const temLink = Boolean(betanoUrl);
      logCardBetanoUrl('H4', 'renderAlertaCardTopo', 'card alerta menu betano', {
        menuKey,
        temLink,
        betanoUrl: temLink ? betanoUrl : null,
      });
      const popoverCls = menuAberto ? '' : ' hidden';
      const linkItem = renderMenuItemAbrirBetano(betanoUrl);
      return '<div class="card-topo">' +
        '<span class="status-badge ' + badgeCls + '">' + escapeHtml(rotuloEstado(estado)) + '</span>' +
        '<div class="card-menu-wrap">' +
          '<button type="button" class="card-menu-kebab" data-key="' + escapeHtml(menuKey) + '" aria-label="Opcoes do alerta" aria-expanded="' + (menuAberto ? 'true' : 'false') + '">' +
            KEBAB_SVG +
          '</button>' +
          '<div class="card-menu-popover' + popoverCls + '">' +
            linkItem +
            '<button type="button" class="menu-item menu-item-danger card-btn-excluir-alerta" data-key="' + escapeHtml(menuKey) + '">Excluir</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function renderCorpoCardAlerta(view) {
      const hora = formatarHora(view.disparadoEm);
      const aoVivo = view.estado === 'ao_vivo';
      const periodoRaw = view.periodoAtual;
      const blocoPeriodo = blocoPeriodoTempo(periodoRaw, view.tempoRestante, view.estado);
      const ladoLiderOdd = ladoLiderOddDoAlerta(view);
      return '<div class="card-corpo">' +
        renderHoraPeriodo(hora, blocoPeriodo, '') +
        renderValoresJogo(
          view.timeCasa, view.timeFora,
          view.oddCasa, view.oddFora,
          view.placarCasa, view.placarFora,
          aoVivo, false, ladoLiderOdd,
        ) +
        '<div class="card-meta-linha">' +
          '<span class="card-meta card-meta-regra">' + escapeHtml(view.nomeRegra) + '</span>' +
        '</div>' +
      '</div>';
    }

    function renderAlertaCard(item, estadoPorGameKey) {
      const { alerta, jogo } = item;
      const estadoGrupo = estadoPorGameKey?.get(alerta.game_key) ?? null;
      const base = alertaParaCardView(alerta, jogo, estadoGrupo);
      const periodoAtual = periodoValido(alerta.periodo_atual)
        ? String(alerta.periodo_atual).trim()
        : 'Finalizado';
      const view = { ...base, periodoAtual };
      const clsCard = classesCard(view.estado, alerta.liga);
      const menuKey = menuKeyAlerta(alerta.id);

      return '<article class="card' + clsCard + '">' +
        renderAlertaCardTopo(view.estado, menuKey, view.betanoUrl) +
        renderCorpoCardAlerta(view) +
      '</article>';
    }

    function renderListaAlertas(alertas, estadoPorGameKey) {
      elConteudo.innerHTML = '<div class="lista">' + alertas.map((item) => renderAlertaCard(item, estadoPorGameKey)).join('') + '</div>';

      elConteudo.querySelectorAll('.card-menu-kebab').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const key = btn.getAttribute('data-key');
          if (key) toggleCardMenu(key);
        });
      });

      elConteudo.querySelectorAll('.card-menu-popover').forEach((pop) => {
        pop.addEventListener('click', (e) => e.stopPropagation());
      });

      elConteudo.querySelectorAll('.card-btn-excluir-alerta').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menuKey = btn.getAttribute('data-key');
          if (!menuKey?.startsWith('alerta:')) return;
          const alertaId = menuKey.slice('alerta:'.length);
          const item = alertas.find((a) => a.alerta.id === alertaId);
          if (item) {
            void excluirAlerta(
              alertaId,
              item.alerta.time_casa,
              item.alerta.time_fora,
            );
          }
        });
      });
    }

    async function excluirAlerta(alertaId, timeCasa, timeFora) {
      const rotulo = timeCasa + ' x ' + timeFora;
      if (!confirm('Excluir o alerta de ' + rotulo + '?')) return;

      const usuarioId = await obterUsuarioId();
      if (!usuarioId) {
        alert('Faca login primeiro');
        return;
      }

      const { data: deletados, error } = await supabase
        .from('alertas_betano')
        .delete()
        .eq('id', alertaId)
        .select('id');

      if (error) {
        alert(error.message);
        return;
      }

      if (!deletados?.length) {
        alert('Nenhum registro excluido. Tente atualizar a pagina.');
        return;
      }

      cardMenuAberto = null;
      await carregar(true);
    }

    async function excluirJogo(gameKey, timeCasa, timeFora) {
      const rotulo = timeCasa + ' x ' + timeFora;
      if (!confirm('Excluir todas as coletas de ' + rotulo + '?')) {
        return;
      }

      const usuarioId = await obterUsuarioId();
      if (!usuarioId) {
        alert('Faca login primeiro');
        return;
      }

      const { data: deletados, error: errJogos } = await supabase
        .from('jogos_coleta')
        .delete()
        .eq('game_key', gameKey)
        .select('id');


      if (errJogos) {
        alert(errJogos.message);
        return;
      }

      if (!deletados?.length) {
        alert('Nenhum registro excluido. Tente atualizar a pagina.');
        return;
      }

      await supabase
        .from('jogos_estado_monitor')
        .delete()
        .eq('game_key', gameKey)
        .eq('usuario_id', usuarioId);

      expandidos.delete(gameKey);
      cardMenuAberto = null;
      await carregar(true);
    }

    function renderLista(jogos) {
      elConteudo.innerHTML = '<div class="lista">' + jogos.map(renderCard).join('') + '</div>';
      elConteudo.querySelectorAll('.card-header').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.getAttribute('data-key');
          if (!key) return;
          if (expandidos.has(key)) expandidos.delete(key);
          else expandidos.add(key);
          renderLista(jogos);
        });
      });

      elConteudo.querySelectorAll('.card-menu-kebab').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const key = btn.getAttribute('data-key');
          if (key) toggleCardMenu(key);
        });
      });

      elConteudo.querySelectorAll('.card-menu-popover').forEach((pop) => {
        pop.addEventListener('click', (e) => e.stopPropagation());
      });

      elConteudo.querySelectorAll('.card-btn-excluir').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const key = btn.getAttribute('data-key');
          const jogo = jogos.find((j) => j.gameKey === key);
          if (key && jogo) void excluirJogo(key, jogo.timeCasa, jogo.timeFora);
        });
      });

    }

    function atualizarStatsHistorico(stats) {
      if (!elHistoricoStatsBar || !elHistoricoStats) return;
      if (telaRegrasAberta) return;
      elHistoricoStatsBar.classList.remove('hidden');
      if (abaAtiva === 'alertas') {
        const total = stats?.total ?? 0;
        elHistoricoStats.textContent = total + ' alerta(s) de ' + rotuloEsporte(esporteAtivo).toLowerCase();
        return;
      }
      if (esporteAtivo === 'futebol') {
        const n = stats?.futebolFinalizadas ?? 0;
        const aoVivo = stats?.futebolAoVivo ?? 0;
        const pct = stats?.futebolPctGol;
        const base = aoVivo + ' ao vivo';
        elHistoricoStats.textContent = pct != null
          ? base + ' · ' + n + ' finalizada(s) · ' + pct + '% com gol nos 5 min'
          : base + ' · ' + n + ' finalizada(s)';
        return;
      }
      elHistoricoStats.textContent = stats
        ? stats.cards + ' jogo(s) de ' + rotuloEsporte(esporteAtivo).toLowerCase() + ' · ' + stats.entradas + ' coleta(s)'
        : '0 jogo(s) de ' + rotuloEsporte(esporteAtivo).toLowerCase();
    }

    async function buscarTodosAlertas() {
      const todos = [];
      let offset = 0;

      while (true) {
        const { data, error } = await supabase
          .from('alertas_betano')
          .select('*, regras_alerta ( periodo, min_pontos, min_odd, nome )')
          .order('disparado_em', { ascending: false })
          .range(offset, offset + HISTORICO_ALERTAS_PAGE - 1);

        if (error) throw new Error(error.message);
        if (!data?.length) break;

        todos.push(...data);
        if (data.length < HISTORICO_ALERTAS_PAGE) break;
        offset += HISTORICO_ALERTAS_PAGE;
      }

      return todos.filter((a) => (a.esporte ?? 'basquete') === esporteAtivo);
    }

    async function enriquecerAlertasComJogos(alertas) {
      const coletaIds = [...new Set(alertas.map((a) => a.coleta_id).filter(Boolean))];
      const jogoPorChave = new Map();

      for (let i = 0; i < coletaIds.length; i += HISTORICO_COLETAS_PAGE) {
        const lote = coletaIds.slice(i, i + HISTORICO_COLETAS_PAGE);
        const { data: jogos, error } = await supabase
          .from('jogos_coleta')
          .select('coleta_id, game_key, odd_casa, odd_fora, tempo_restante, url_partida')
          .in('coleta_id', lote);

        if (error) throw new Error(error.message);

        for (const jogo of jogos ?? []) {
          jogoPorChave.set(jogo.coleta_id + '|' + jogo.game_key, jogo);
        }
      }

      return alertas.map((alerta) => {
        const chave = alerta.coleta_id ? alerta.coleta_id + '|' + alerta.game_key : null;
        return {
          alerta,
          jogo: chave ? jogoPorChave.get(chave) ?? null : null,
        };
      });
    }

    async function buscarDadosAlertas() {
      const alertas = await buscarTodosAlertas();
      return enriquecerAlertasComJogos(alertas);
    }

    async function buscarTodosJogos() {
      const todos = [];
      let offsetColetas = 0;
      let pageColetas = 0;
      let coletasComJogos = 0;

      while (true) {
        pageColetas += 1;
        const { data: coletas, error: errC } = await supabase
          .from('coletas_betano')
          .select('id, coletado_em')
          .order('coletado_em', { ascending: false })
          .range(offsetColetas, offsetColetas + HISTORICO_COLETAS_PAGE - 1);


        if (errC) throw new Error(errC.message);
        if (!coletas?.length) break;

        const coletaMap = new Map(coletas.map((c) => [c.id, c.coletado_em]));
        const ids = coletas.map((c) => c.id);

        const { data: jogos, error: errJ } = await supabase
          .from('jogos_coleta')
          .select('*')
          .in('coleta_id', ids);


        if (errJ) throw new Error(errJ.message);

        for (const jogo of jogos ?? []) {
          const coletadoEm = coletaMap.get(jogo.coleta_id);
          if (!coletadoEm) continue;
          coletasComJogos += 1;
          todos.push({
            ...jogo,
            coletas_betano: { coletado_em: coletadoEm },
          });
        }

        if (coletas.length < HISTORICO_COLETAS_PAGE) break;
        offsetColetas += HISTORICO_COLETAS_PAGE;
      }

      return todos;
    }

    async function buscarDados() {
      const [{ data: ultimaColeta, error: errU }, jogos] = await Promise.all([
        supabase
          .from('coletas_betano')
          .select('coletado_em')
          .order('coletado_em', { ascending: false })
          .limit(1)
          .maybeSingle(),
        buscarTodosJogos(),
      ]);

      if (errU) throw new Error(errU.message);
      const jogosFiltrados = jogos.filter((j) => jogoEsporte(j) === esporteAtivo);
      if (!jogosFiltrados.length) {
        return [];
      }

      const grupos = montarGrupos(ultimaColeta?.coletado_em ?? null, jogosFiltrados);
      return grupos;
    }

    async function coletarAgora() {
      if (coletando) return;
      if (esporteAtivo === 'futebol') {
        coletando = true;
        elBtnColetar.disabled = true;
        elBtnColetar.textContent = 'Coletando...';
        try {
          const coleta = await executarColetaFutebolRadar();
          const dados = await buscarEstatisticasFutebol();
          const aoVivoJson = Array.isArray(coleta.footballRadar) ? coleta.footballRadar : [];
          await aplicarPainelFutebol(dados, aoVivoJson);
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Falha na coleta de futebol');
        } finally {
          coletando = false;
          elBtnColetar.disabled = false;
          elBtnColetar.textContent = 'Coletar Agora';
        }
        return;
      }
      coletando = true;
      elBtnColetar.disabled = true;
      elBtnColetar.textContent = 'Coletando...';

      try {
        const usuarioId = await obterUsuarioId();
        if (!usuarioId) throw new Error('Faca login primeiro');

        const { data: fnData, error: fnErr } = await supabase.functions.invoke('betano-coleta', { body: {} });
        if (fnErr) throw new Error(fnErr.message);
        const coleta = fnData;
        if (!coleta) throw new Error('Resposta vazia da coleta');

        const games = coleta.games ?? [];
        if (!games.length) {
          await atualizarStatusMonitor();
          renderVazio(coleta.summary || 'Nenhum jogo de basquete ao vivo no momento.');
          return;
        }

        const agora = new Date().toISOString();
        const resumoJson = JSON.stringify(coleta);
        const { data: coletaRow, error: errIns } = await supabase
          .from('coletas_betano')
          .insert({
            usuario_id: usuarioId,
            coletado_em: agora,
            fonte_parser: 'api',
            sucesso: Boolean(coleta.ok) && !coleta.blocked,
            qtd_jogos: games.length,
            erro_mensagem: null,
            texto_tamanho: resumoJson.length,
            texto_preview: resumoJson.slice(0, 2000),
            dispositivo_id: 'web-historico',
            data_atualizacao: agora,
          })
          .select('id')
          .single();

        if (errIns) throw new Error(errIns.message);

        const linhas = games.map((g) => ({
          coleta_id: coletaRow.id,
          game_key: buildGameKey('basquete', g.homeTeam, g.awayTeam),
          esporte: 'basquete',
          time_casa: g.homeTeam,
          time_fora: g.awayTeam,
          liga: g.league,
          periodo: g.period,
          placar_casa: g.homeScore,
          placar_fora: g.awayScore,
          odd_casa: g.homeOdd ?? 0,
          odd_fora: g.awayOdd ?? 0,
          tempo_restante: g.tempoRestante ?? null,
          event_id: g.eventId ?? null,
          url_partida: g.betanoUrl ?? null,
        }));
        const { error: errJogos } = await supabase.from('jogos_coleta').insert(linhas);
        if (errJogos) throw new Error(errJogos.message);

        try {
          await avaliarAlertasColeta(coletaRow.id);
        } catch (_) {
          /* alertas opcionais se function ainda nao deployada */
        }

        await atualizarStatusMonitor();
        await carregar(true);
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Falha na coleta');
      } finally {
        coletando = false;
        elBtnColetar.disabled = false;
        elBtnColetar.textContent = 'Coletar Agora';
      }
    }

    async function carregar(silencioso = false) {
      if (telaRegrasAberta) return;
      if (!silencioso) renderLoading();
      try {
        if (abaAtiva === 'alertas') {
          const [alertas, grupos] = await Promise.all([
            buscarDadosAlertas(),
            esporteAtivo === 'basquete' ? buscarDados() : Promise.resolve([]),
          ]);
          const estadoPorGameKey = new Map(grupos.map((g) => [g.gameKey, g.estado]));
          atualizarStatsHistorico({ total: alertas.length });
          if (alertas.length === 0) renderVazioAlertas();
          else renderListaAlertas(alertas, estadoPorGameKey);
          return;
        }

        if (esporteAtivo === 'futebol') {
          await carregarFutebol(silencioso);
          return;
        }

        const jogos = await buscarDados();
        const entradas = jogos.reduce((s, g) => s + g.entradas.length, 0);
        atualizarStatsHistorico(
          jogos.length
            ? { cards: jogos.length, entradas, runId: 'pre-fix' }
            : null,
        );
        if (jogos.length === 0) renderVazio();
        else renderLista(jogos);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao carregar histórico';
        atualizarStatsHistorico(null);
        renderErro(msg);
      }
    }

    function mostrarLogin() {
      elLogin.classList.remove('hidden');
      elMain.classList.add('hidden');
      elHistoricoStatsBar?.classList.add('hidden');
      elAbasEsporte?.classList.add('hidden');
      elAbasHistorico?.classList.add('hidden');
      elPainelRegras?.classList.add('hidden');
      telaRegrasAberta = false;
      pararAutoRefresh();
      pararRealtime();
      pararTimerStatus();
    }

    function mostrarApp(email) {
      elLogin.classList.add('hidden');
      elMain.classList.remove('hidden');
      elHistoricoStatsBar?.classList.remove('hidden');
      elAbasEsporte?.classList.remove('hidden');
      elAbasHistorico?.classList.remove('hidden');
      atualizarAbasEsporteUi();
      atualizarAbasUi();
      elUserEmail.textContent = email;
      iniciarAutoRefresh();
      iniciarRealtime();
      void atualizarStatusMonitor();
      void carregar();
    }

    function iniciarAutoRefresh() {
      pararAutoRefresh();
      refreshTimer = setInterval(() => void carregar(true), AUTO_REFRESH_MS);
    }

    function pararAutoRefresh() {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
    }

    function agendarRecargaRealtime() {
      if (realtimeDebounce) clearTimeout(realtimeDebounce);
      realtimeDebounce = setTimeout(() => {
        realtimeDebounce = null;
        void carregar(true);
      }, 400);
    }

    function pararRealtime() {
      if (realtimeDebounce) {
        clearTimeout(realtimeDebounce);
        realtimeDebounce = null;
      }
      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    }

    function iniciarRealtime() {
      pararRealtime();
      realtimeChannel = supabase
        .channel('historico-web-' + Date.now())
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'coletas_betano' },
          () => agendarRecargaRealtime()
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'jogos_coleta' },
          () => agendarRecargaRealtime()
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'alertas_betano' },
          () => agendarRecargaRealtime()
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'coleta_scheduler' },
          () => void atualizarStatusMonitor()
        )
        .subscribe();
    }

    document.getElementById('btn-login').addEventListener('click', async () => {
      elLoginErro.classList.add('hidden');
      const email = document.getElementById('email').value.trim();
      const senha = document.getElementById('senha').value;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) {
        elLoginErro.textContent = error.message;
        elLoginErro.classList.remove('hidden');
        return;
      }
      if (data.session?.user?.email) mostrarApp(data.session.user.email);
    });

    document.getElementById('btn-sair').addEventListener('click', async () => {
      await supabase.auth.signOut();
      expandidos = new Set();
      telaRegrasAberta = false;
      mostrarLogin();
    });

    elAbaColetas?.addEventListener('click', () => trocarAba('coletas'));
    elAbaAlertas?.addEventListener('click', () => trocarAba('alertas'));
    elEsporteBasquete?.addEventListener('click', () => trocarEsporte('basquete'));
    elEsporteFutebol?.addEventListener('click', () => trocarEsporte('futebol'));

    elBtnRegrasMenu?.addEventListener('click', () => {
      abrirTelaRegras();
    });

    elBtnVoltarRegras?.addEventListener('click', () => {
      fecharTelaRegras();
    });

    elBtnColetar.addEventListener('click', () => {
      void coletarAgora();
    });

    elBtnCancelarEdicaoRegra?.addEventListener('click', () => {
      limparFormRegra();
    });

    elFormRegra.addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = document.getElementById('regra-nome').value;
      const periodo = document.getElementById('regra-periodo').value;
      const minPontos = Number(document.getElementById('regra-pontos').value);
      const minOdd = Number(document.getElementById('regra-odd').value);
      if (!nome?.trim()) {
        alert('Informe o nome da regra.');
        return;
      }
      if (!periodo || !Number.isFinite(minPontos) || minPontos < 1) {
        alert(esporteAtivo === 'futebol'
          ? 'Informe o tempo e a vantagem mínima em gols (mínimo 1).'
          : 'Informe o quarto e a vantagem mínima em pontos (mínimo 1).');
        return;
      }
      if (!Number.isFinite(minOdd) || minOdd <= 0) {
        alert('Informe a odd mínima do líder (maior que 0).');
        return;
      }
      void salvarRegra(nome, periodo, minPontos, minOdd)
        .catch((err) => alert(err instanceof Error ? err.message : 'Erro ao salvar regra'));
    });

    elBtnMonitor.addEventListener('click', async () => {
      try {
        if (monitorAtivo) await pararMonitorNuvem();
        else await iniciarMonitorNuvem();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erro ao alterar coleta');
      }
    });

    elBtnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    elMenuPopover.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => {
      fecharMenu();
      fecharCardMenu();
    });

    atualizarUiFormRegra();

    document.getElementById('senha').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-login').click();
    });

    const { data: sessao } = await supabase.auth.getSession();
    if (sessao.session?.user?.email) {
      mostrarApp(sessao.session.user.email);
    } else {
      mostrarLogin();
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) mostrarApp(session.user.email);
      else mostrarLogin();
    });
  </script>
</body>
</html>`;
}

export function buildHistoricoPage(supabaseUrl: string, supabaseAnonKey: string): string {
  return buildHistoricoTemplate()
    .replaceAll(HISTORICO_URL_PLACEHOLDER, supabaseUrl)
    .replaceAll(HISTORICO_ANON_KEY_PLACEHOLDER, supabaseAnonKey);
}
