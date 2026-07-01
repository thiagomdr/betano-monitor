export const HISTORICO_URL_PLACEHOLDER = '__SUPABASE_URL__';
export const HISTORICO_ANON_KEY_PLACEHOLDER = '__SUPABASE_ANON_KEY__';

export function buildHistoricoTemplate(): string {
  const configJson = `{"url":"${HISTORICO_URL_PLACEHOLDER}","anonKey":"${HISTORICO_ANON_KEY_PLACEHOLDER}"}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
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
      padding: 16px 12px 12px;
      border-bottom: 1px solid #222;
      position: sticky;
      top: 0;
      background: #111;
      z-index: 10;
    }
    .title { font-size: 20px; font-weight: 700; color: #fff; flex: 1; min-width: 0; }
    .title-accent { color: #c45c00; }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
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
    .lista { padding: 12px; padding-bottom: 32px; max-width: 720px; margin: 0 auto; }
    .card {
      background: #1a1a1a;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 10px;
      position: relative;
    }
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
    .card.finalizado .card-nome-time { color: #888; }
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
      border-radius: 999px;
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
      border-radius: 4px;
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
    .painel-regras {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 300;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 16px 12px 32px;
      overflow-y: auto;
    }
    .painel-regras-box {
      width: 100%;
      max-width: 420px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 16px;
      margin-top: 8px;
    }
    .painel-regras-topo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .painel-regras-topo h2 { font-size: 16px; color: #fff; }
    .btn-fechar-regras {
      background: transparent;
      border: none;
      color: #aaa;
      font-size: 22px;
      line-height: 1;
      padding: 4px 8px;
      cursor: pointer;
    }
    .regra-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px;
      background: #141414;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .regra-item-texto { flex: 1; color: #eee; line-height: 1.4; }
    .regra-item.inativa { opacity: 0.45; }
    .regra-btn {
      background: transparent;
      border: 1px solid #444;
      border-radius: 6px;
      color: #ccc;
      font-size: 11px;
      padding: 4px 8px;
      cursor: pointer;
    }
    .regra-btn.excluir { color: #ff6b6b; border-color: #553333; }
    .form-regra {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #333;
    }
    .form-regra select,
    .form-regra input {
      width: 100%;
      background: #111;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 10px;
      color: #fff;
      font-size: 14px;
    }
    .form-regra button[type="submit"] {
      grid-column: 1 / -1;
      background: #c45c00;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .regras-vazio { color: #888; font-size: 13px; padding: 8px 0; line-height: 1.5; }
    .historico-stats-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 12px 10px;
      border-bottom: 1px solid #222;
    }
    .historico-stats-text {
      font-size: 12px;
      color: #888;
      flex: 1;
      min-width: 0;
      line-height: 1.4;
    }
    .regras-gear-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .regras-gear-btn {
      padding: 2px;
      color: #fff;
    }
    .regras-gear-btn:hover,
    .regras-gear-btn:active {
      color: #c45c00;
    }
    .regras-gear-icon {
      display: block;
      width: 24px;
      height: 24px;
    }
    .regras-popover {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 168px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 10px;
      padding: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      z-index: 200;
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
        <div class="title">Monitor <span class="title-accent">Betano</span></div>
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
            <button id="btn-coletar" class="menu-item menu-item-primary" type="button" role="menuitem">Coletar Agora</button>
            <button id="btn-monitor" class="menu-item" type="button" role="menuitem">Parar Coleta</button>
            <button id="btn-atualizar" class="menu-item" type="button" role="menuitem">Atualizar</button>
            <button id="btn-sair" class="menu-item" type="button" role="menuitem">Sair</button>
          </div>
        </div>
      </div>
    </header>
    <div id="historico-stats-bar" class="historico-stats-bar hidden">
      <span id="historico-stats" class="historico-stats-text" aria-live="polite"></span>
      <div class="regras-gear-wrap">
        <button id="btn-regras-gear" type="button" class="menu-kebab regras-gear-btn" aria-label="Configurações" aria-expanded="false" aria-haspopup="true">
          <svg class="regras-gear-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></svg>
        </button>
        <div id="regras-popover" class="regras-popover hidden" role="menu">
          <button id="btn-regras" class="menu-item" type="button" role="menuitem">Regras de Alerta</button>
        </div>
      </div>
    </div>
    <div id="conteudo"></div>
  </div>

  <div id="painel-regras" class="painel-regras hidden" role="dialog" aria-label="Regras de alerta">
    <div class="painel-regras-box">
      <div class="painel-regras-topo">
        <h2>Regras de Alerta</h2>
        <button type="button" id="btn-fechar-regras" class="btn-fechar-regras" aria-label="Fechar">×</button>
      </div>
      <p class="regras-vazio" id="regras-ajuda">Alerta quando o jogo estiver no Q escolhido, com a vantagem em pontos e odd do líder acima dos limites. Uma vez por jogo, por regra.</p>
      <div id="lista-regras"></div>
      <form id="form-regra" class="form-regra">
        <select id="regra-periodo" aria-label="Periodo">
          <option value="Q1">Q1</option>
          <option value="Q2">Q2</option>
          <option value="Q3">Q3</option>
          <option value="Q4">Q4</option>
        </select>
        <input id="regra-pontos" type="number" min="1" step="1" placeholder="+ pontos" required />
        <input id="regra-odd" type="number" min="0" step="0.1" placeholder="Odd líder &gt;" required />
        <button type="submit">Adicionar regra</button>
      </form>
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

    const PERIODOS_AO_VIVO = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'Intervalo', 'INT', 'HT', 'OT']);
    const TEXTO_INVALIDO = /não existem mercados|mercados disponíveis|de momento|^unknown$/i;
    const HISTORICO_COLETAS_PAGE = 100;
    const AUTO_REFRESH_MS = 45_000;
    const CHAVE_COLETA_ATIVADA = 'betano_coleta_ativada_em';
    const CHAVE_COLETA_PARADA = 'betano_coleta_parada_em';

    function dbg(hypothesisId, location, message, data, runId) {
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
          runId: runId || 'pre-fix',
        }),
      }).catch(() => {});
      // #endregion
    }

    const elLogin = document.getElementById('app-login');
    const elMain = document.getElementById('app-main');
    const elConteudo = document.getElementById('conteudo');
    const elHistoricoStatsBar = document.getElementById('historico-stats-bar');
    const elHistoricoStats = document.getElementById('historico-stats');
    const elBtnRegrasGear = document.getElementById('btn-regras-gear');
    const elRegrasPopover = document.getElementById('regras-popover');
    const elLoginErro = document.getElementById('login-erro');
    const elUserEmail = document.getElementById('user-email');
    const elMonitorStatus = document.getElementById('monitor-status');
    const elBtnMonitor = document.getElementById('btn-monitor');
    const elBtnColetar = document.getElementById('btn-coletar');
    const elBtnMenu = document.getElementById('btn-menu');
    const elMenuPopover = document.getElementById('menu-popover');
    const elPainelRegras = document.getElementById('painel-regras');
    const elListaRegras = document.getElementById('lista-regras');
    const elFormRegra = document.getElementById('form-regra');

    let expandidos = new Set();
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

    function fecharRegrasPopover() {
      if (!elRegrasPopover) return;
      elRegrasPopover.classList.add('hidden');
      elBtnRegrasGear?.setAttribute('aria-expanded', 'false');
    }

    function toggleRegrasPopover() {
      const aberto = !elRegrasPopover.classList.contains('hidden');
      if (aberto) {
        fecharRegrasPopover();
      } else {
        fecharMenu();
        fecharCardMenu();
        elRegrasPopover.classList.remove('hidden');
        elBtnRegrasGear.setAttribute('aria-expanded', 'true');
      }
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

    function toggleCardMenu(key) {
      fecharMenu();
      fecharRegrasPopover();
      cardMenuAberto = cardMenuAberto === key ? null : key;
      atualizarCardMenusDom();
    }

    function toggleMenu() {
      const aberto = !elMenuPopover.classList.contains('hidden');
      if (aberto) fecharMenu();
      else {
        fecharCardMenu();
        fecharRegrasPopover();
        if (monitorAtivo) atualizarTextoStatusMonitor();
        elMenuPopover.classList.remove('hidden');
        elBtnMenu.setAttribute('aria-expanded', 'true');
      }
    }

    async function obterUsuarioId() {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    }

    function formatarTextoRegra(r) {
      const nome = r.nome ? r.nome + ' — ' : '';
      return nome + r.periodo + ', +' + r.min_pontos + ' pts, odd líder &gt; ' + Number(r.min_odd).toFixed(1);
    }

    function renderListaRegras(regras) {
      if (!regras.length) {
        elListaRegras.innerHTML = '<p class="regras-vazio">Nenhuma regra cadastrada.</p>';
        return;
      }
      elListaRegras.innerHTML = regras.map((r) => {
        const cls = r.ativo ? 'regra-item' : 'regra-item inativa';
        return '<div class="' + cls + '" data-id="' + escapeHtml(r.id) + '">' +
          '<div class="regra-item-texto">' + formatarTextoRegra(r) + '</div>' +
          '<button type="button" class="regra-btn btn-toggle-regra" data-id="' + escapeHtml(r.id) + '">' +
            (r.ativo ? 'Desativar' : 'Ativar') +
          '</button>' +
          '<button type="button" class="regra-btn excluir btn-excluir-regra" data-id="' + escapeHtml(r.id) + '">Excluir</button>' +
        '</div>';
      }).join('');

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

    async function carregarRegras() {
      const usuarioId = await obterUsuarioId();
      if (!usuarioId) return;
      const { data, error } = await supabase
        .from('regras_alerta')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('ordem', { ascending: true })
        .order('data_criacao', { ascending: true });
      if (error) {
        elListaRegras.innerHTML = '<p class="regras-vazio">' + escapeHtml(error.message) + '</p>';
        return;
      }
      renderListaRegras(data ?? []);
    }

    function abrirPainelRegras() {
      fecharRegrasPopover();
      elPainelRegras.classList.remove('hidden');
      void carregarRegras();
    }

    function fecharPainelRegras() {
      elPainelRegras.classList.add('hidden');
    }

    async function adicionarRegra(periodo, minPontos, minOdd) {
      const usuarioId = await obterUsuarioId();
      if (!usuarioId) throw new Error('Faca login primeiro');
      const { error } = await supabase.from('regras_alerta').insert({
        usuario_id: usuarioId,
        periodo,
        min_pontos: minPontos,
        min_odd: minOdd,
        ativo: true,
      });
      if (error) throw error;
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
      else await carregarRegras();
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
        elBtnMonitor.textContent = 'Iniciar Coleta';
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
        elBtnMonitor.textContent = 'Iniciar Coleta';
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
      elBtnMonitor.textContent = 'Iniciar Coleta';
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

    function buildGameKey(home, away) {
      return [home, away]
        .map((n) => n.trim().toLowerCase().replace(/\s+/g, ' '))
        .sort()
        .join('|');
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
      if (ultimaColetaGlobalEm && entradas.length) {
        const tsGlobal = new Date(ultimaColetaGlobalEm).getTime();
        const ultima = entradaMaisRecente(entradas);
        if (new Date(ultima.coletadoEm).getTime() < tsGlobal) return 'finalizado';
      }
      const ref = ultimaEntradaPeriodoValido(entradas)?.periodo ?? entradaMaisRecente(entradas).periodo;
      if (!periodoValido(ref)) return 'finalizado';
      return PERIODOS_AO_VIVO.has(ref.trim()) ? 'ao_vivo' : 'finalizado';
    }

    function formatarPeriodoCard(periodo, estado) {
      if (periodoValido(periodo)) return String(periodo).trim();
      return estado === 'finalizado' ? 'Finalizado' : '—';
    }

    function formatarOddWeb(valor) {
      const n = Number(valor ?? 0);
      if (!Number.isFinite(n) || n <= 0) {
        // #region agent log
        fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '94b3c3' },
          body: JSON.stringify({
            sessionId: '94b3c3',
            hypothesisId: 'H1',
            location: 'historicoWebPage:formatarOddWeb',
            message: 'odd vencedor ausente',
            data: { valor, formatado: '0.0' },
            timestamp: Date.now(),
            runId: 'post-fix',
          }),
        }).catch(() => {});
        // #endregion
        return '0.0';
      }
      return n.toFixed(2);
    }

    function inferirEstadoEntrada(periodo) {
      if (!periodoValido(periodo)) return 'finalizado';
      return PERIODOS_AO_VIVO.has(periodo.trim()) ? 'ao_vivo' : 'finalizado';
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
          rotuloVantagem: formatarRotuloVantagem(
            jogo.placar_casa, jogo.placar_fora, jogo.time_casa, jogo.time_fora,
          ),
        };

        const grupoKey = jogo.game_key || buildGameKey(jogo.time_casa, jogo.time_fora);
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
        grupos.push({
          gameKey,
          timeCasa: meta.time_casa,
          timeFora: meta.time_fora,
          liga: sanitizarLiga(meta.liga),
          estado,
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
      const totalEntradas = grupos.reduce((s, g) => s + g.entradas.length, 0);
      dbg('H2', 'historicoWebPage:montarGrupos', 'grupos montados', {
        jogosInput: jogos.length,
        semColetadoEm,
        grupos: grupos.length,
        totalEntradas,
        amostraEmbed: jogos[0] ? {
          temEmb: Boolean(jogos[0].coletas_betano),
          tipoEmb: Array.isArray(jogos[0].coletas_betano) ? 'array' : typeof jogos[0].coletas_betano,
        } : null,
      });
      dbg('H5', 'historicoWebPage:montarGrupos', 'cards vs entradas', {
        cards: grupos.length,
        entradas: totalEntradas,
      });
      return grupos;
    }

    function rotuloEstado(estado) {
      return estado === 'ao_vivo' ? 'Ao Vivo' : 'Finalizado';
    }

    function renderLinhaTime(nome, odd, placar, placarOponente, lado, aoVivo, forcarCorTime) {
      const clsBox = forcarCorTime
        ? 'card-box ' + lado + ' ao-vivo'
        : (aoVivo ? 'card-box ' + lado + ' ao-vivo' : 'card-box finalizado');
      const vantagem = calcularVantagem(placar, placarOponente);
      const vantagemHtml = vantagem != null
        ? '<span class="card-vantagem">+' + vantagem + '</span>'
        : '';
      return '<div class="card-linha-time">' +
        '<span class="card-nome-time">' +
          '<span class="card-nome-texto">' + escapeHtml(nome) + '</span>' +
          vantagemHtml +
        '</span>' +
        '<div class="card-boxes">' +
          '<span class="' + clsBox + '">' + escapeHtml(String(placar)) + '</span>' +
          '<span class="' + clsBox + '">' + escapeHtml(formatarOddWeb(odd)) + '</span>' +
        '</div>' +
      '</div>';
    }

    function renderValoresJogo(timeCasa, timeFora, oddCasa, oddFora, placarCasa, placarFora, aoVivo, forcarCorTime) {
      return '<div class="card-valores">' +
          '<div class="card-colunas">' +
            '<span class="card-col-nome"></span>' +
            '<div class="card-boxes">' +
              '<span class="card-col-titulo">Placar</span>' +
              '<span class="card-col-titulo">ODDS</span>' +
            '</div>' +
          '</div>' +
          renderLinhaTime(timeCasa, oddCasa, placarCasa, placarFora, 'casa', aoVivo, forcarCorTime) +
          renderLinhaTime(timeFora, oddFora, placarFora, placarCasa, 'fora', aoVivo, forcarCorTime) +
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

    function renderCardTopo(jogo) {
      const badgeCls = jogo.estado === 'ao_vivo' ? 'ao-vivo' : 'finalizado';
      const menuAberto = cardMenuAberto === jogo.gameKey;
      return '<div class="card-topo">' +
        '<span class="status-badge ' + badgeCls + '">' + escapeHtml(rotuloEstado(jogo.estado)) + '</span>' +
        '<div class="card-menu-wrap">' +
          '<button type="button" class="card-menu-kebab" data-key="' + escapeHtml(jogo.gameKey) + '" aria-label="Opcoes do jogo" aria-expanded="' + (menuAberto ? 'true' : 'false') + '">' +
            KEBAB_SVG +
          '</button>' +
          '<div class="card-menu-popover' + (menuAberto ? '' : ' hidden') + '">' +
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

      const clsFinalizado = jogo.estado === 'finalizado' ? ' finalizado' : '';

      return '<article class="card' + clsFinalizado + '">' +
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

    function renderLoading() {
      elConteudo.innerHTML = '<div class="centro"><div class="spinner"></div></div>';
    }

    function renderErro(msg) {
      elConteudo.innerHTML = '<div class="centro"><p class="erro">' + escapeHtml(msg) + '</p>' +
        '<button type="button" id="btn-retry">Tentar novamente</button></div>';
      document.getElementById('btn-retry')?.addEventListener('click', () => void carregar());
    }

    function renderVazio(motivo) {
      const msg = motivo ||
        'Nenhum jogo registrado ainda. Use Iniciar Coleta ou Coletar Agora quando houver basquete ao vivo na Betano.';
      elConteudo.innerHTML = '<div class="centro"><p class="aviso">' + escapeHtml(msg) + '</p></div>';
    }

    async function excluirJogo(gameKey, timeCasa, timeFora) {
      const rotulo = timeCasa + ' x ' + timeFora;
      if (!confirm('Excluir todas as coletas de ' + rotulo + '?')) {
        // #region agent log
        fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H5',location:'historicoWebPage:excluirJogo',message:'confirm cancelado',data:{gameKey},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return;
      }

      const usuarioId = await obterUsuarioId();
      if (!usuarioId) {
        // #region agent log
        fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H5',location:'historicoWebPage:excluirJogo',message:'sem usuarioId',data:{gameKey},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        alert('Faca login primeiro');
        return;
      }

      const keyClient = buildGameKey(timeCasa, timeFora);
      const { data: amostraKey } = await supabase
        .from('jogos_coleta')
        .select('id, game_key, time_casa, time_fora')
        .eq('game_key', gameKey)
        .limit(5);
      const { data: amostraTimes } = await supabase
        .from('jogos_coleta')
        .select('id, game_key, time_casa, time_fora')
        .eq('time_casa', timeCasa)
        .eq('time_fora', timeFora)
        .limit(5);

      // #region agent log
      fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H2',location:'historicoWebPage:excluirJogo',message:'chaves antes do delete',data:{gameKeyDelete:gameKey,keyClient,timeCasa,timeFora,porGameKey:amostraKey?.length??0,porTimes:amostraTimes?.length??0,dbKeysFromTimes:[...new Set((amostraTimes??[]).map((r)=>r.game_key))],keyClientEqualsDb:(amostraTimes??[])[0]?.game_key===gameKey},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      const { data: deletados, error: errJogos } = await supabase
        .from('jogos_coleta')
        .delete()
        .eq('game_key', gameKey)
        .select('id');

      // #region agent log
      fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H1',location:'historicoWebPage:excluirJogo',message:'resultado delete jogos_coleta',data:{gameKey,errMsg:errJogos?.message??null,qtdDeletados:deletados?.length??0},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      if (errJogos) {
        alert(errJogos.message);
        return;
      }

      if (!deletados?.length) {
        alert('Nenhum registro excluido. Tente atualizar a pagina.');
        // #region agent log
        fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H1',location:'historicoWebPage:excluirJogo',message:'zero linhas deletadas',data:{gameKey},timestamp:Date.now(),runId:'post-fix'})}).catch(()=>{});
        // #endregion
        return;
      }

      await supabase
        .from('jogos_estado_monitor')
        .delete()
        .eq('game_key', gameKey)
        .eq('usuario_id', usuarioId);

      expandidos.delete(gameKey);
      cardMenuAberto = null;
      const antes = elConteudo.querySelectorAll('.card').length;
      await carregar(true);
      const depois = elConteudo.querySelectorAll('.card').length;
      // #region agent log
      fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H4',location:'historicoWebPage:excluirJogo',message:'apos carregar',data:{gameKey,cardsAntes:antes,cardsDepois:depois},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
          // #region agent log
          fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'94b3c3'},body:JSON.stringify({sessionId:'94b3c3',hypothesisId:'H3',location:'historicoWebPage:card-btn-excluir',message:'clique excluir',data:{key,jogoFound:Boolean(jogo),timeCasa:jogo?.timeCasa??null},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (key && jogo) void excluirJogo(key, jogo.timeCasa, jogo.timeFora);
        });
      });

      // #region agent log
      const sampleCard = elConteudo.querySelector('.card');
      const sampleBoxes = sampleCard?.querySelector('.card-boxes');
      const sampleBadge = sampleCard?.querySelector('.status-badge');
      if (sampleCard && sampleBoxes && sampleBadge) {
        const cardR = sampleCard.getBoundingClientRect();
        const boxesR = sampleBoxes.getBoundingClientRect();
        const badgeR = sampleBadge.getBoundingClientRect();
        fetch('http://127.0.0.1:7904/ingest/86615625-6ae5-4e98-a1da-0a5f0f15fc42', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '94b3c3' },
          body: JSON.stringify({
            sessionId: '94b3c3',
            hypothesisId: 'H1',
            location: 'historicoWebPage:renderLista',
            message: 'alinhamento placar/odds',
            data: {
              gapBoxesToCardRight: Math.round(cardR.right - boxesR.right),
              gapBadgeToCardRight: Math.round(cardR.right - badgeR.right),
              boxesRight: Math.round(boxesR.right),
              badgeRight: Math.round(badgeR.right),
            },
            timestamp: Date.now(),
            runId: 'post-fix-align',
          }),
        }).catch(() => {});
      }
      // #endregion
    }

    function atualizarStatsHistorico(stats) {
      if (!elHistoricoStatsBar || !elHistoricoStats) return;
      elHistoricoStatsBar.classList.remove('hidden');
      elHistoricoStats.textContent = stats
        ? stats.cards + ' jogo(s) · ' + stats.entradas + ' coleta(s) no histórico'
        : '0 jogo(s) · 0 coleta(s) no histórico';
      if (stats) dbg('H5', 'historicoWebPage:stats', 'stats visiveis', stats, stats.runId);
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

        dbg('H1', 'historicoWebPage:buscarTodosJogos', 'pagina coletas', {
          pageColetas,
          offsetColetas,
          coletas: coletas?.length ?? 0,
          errMsg: errC?.message ?? null,
        });

        if (errC) throw new Error(errC.message);
        if (!coletas?.length) break;

        const coletaMap = new Map(coletas.map((c) => [c.id, c.coletado_em]));
        const ids = coletas.map((c) => c.id);

        const { data: jogos, error: errJ } = await supabase
          .from('jogos_coleta')
          .select('*')
          .in('coleta_id', ids);

        dbg('H1', 'historicoWebPage:buscarTodosJogos', 'jogos do batch', {
          pageColetas,
          coletasNoBatch: ids.length,
          jogosNoBatch: jogos?.length ?? 0,
          errMsg: errJ?.message ?? null,
        });

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

      dbg('H1', 'historicoWebPage:buscarTodosJogos', 'total final', {
        paginasColetas: pageColetas,
        totalJogos: todos.length,
        coletasComJogos,
      });
      return todos;
    }

    async function buscarDados() {
      dbg('H4', 'historicoWebPage:buscarDados', 'inicio', {
        coletasPage: HISTORICO_COLETAS_PAGE,
        href: typeof location !== 'undefined' ? location.href : null,
      });
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
      if (!jogos.length) {
        dbg('H3', 'historicoWebPage:buscarDados', 'zero jogos', { errU: errU?.message ?? null });
        return [];
      }

      const grupos = montarGrupos(ultimaColeta?.coletado_em ?? null, jogos);
      dbg('H3', 'historicoWebPage:buscarDados', 'resultado', {
        jogosDb: jogos.length,
        gruposUi: grupos.length,
        ultimaColetaEm: ultimaColeta?.coletado_em ?? null,
      });
      return grupos;
    }

    async function coletarAgora() {
      if (coletando) return;
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
          game_key: buildGameKey(g.homeTeam, g.awayTeam),
          time_casa: g.homeTeam,
          time_fora: g.awayTeam,
          liga: g.league,
          periodo: g.period,
          placar_casa: g.homeScore,
          placar_fora: g.awayScore,
          odd_casa: g.homeOdd ?? 0,
          odd_fora: g.awayOdd ?? 0,
          tempo_restante: g.tempoRestante ?? null,
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
      if (!silencioso) renderLoading();
      try {
        const jogos = await buscarDados();
        const entradas = jogos.reduce((s, g) => s + g.entradas.length, 0);
        dbg('H5', 'historicoWebPage:carregar', 'render', { grupos: jogos.length, entradas, silencioso });
        atualizarStatsHistorico(
          jogos.length
            ? { cards: jogos.length, entradas, runId: 'pre-fix' }
            : null,
        );
        if (jogos.length === 0) renderVazio();
        else renderLista(jogos);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao carregar histórico';
        dbg('H3', 'historicoWebPage:carregar', 'erro', { msg });
        atualizarStatsHistorico(null);
        renderErro(msg);
      }
    }

    function mostrarLogin() {
      elLogin.classList.remove('hidden');
      elMain.classList.add('hidden');
      elHistoricoStatsBar?.classList.add('hidden');
      fecharRegrasPopover();
      pararAutoRefresh();
      pararRealtime();
      pararTimerStatus();
    }

    function mostrarApp(email) {
      elLogin.classList.add('hidden');
      elMain.classList.remove('hidden');
      elHistoricoStatsBar?.classList.remove('hidden');
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
      mostrarLogin();
    });

    document.getElementById('btn-atualizar').addEventListener('click', () => {
      void carregar();
    });

    elBtnColetar.addEventListener('click', () => {
      void coletarAgora();
    });

    elBtnRegrasGear.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRegrasPopover();
    });

    elRegrasPopover.addEventListener('click', (e) => e.stopPropagation());

    document.getElementById('btn-regras').addEventListener('click', () => {
      abrirPainelRegras();
    });

    document.getElementById('btn-fechar-regras').addEventListener('click', () => {
      fecharPainelRegras();
    });

    elPainelRegras.addEventListener('click', (e) => {
      if (e.target === elPainelRegras) fecharPainelRegras();
    });

    elFormRegra.addEventListener('submit', (e) => {
      e.preventDefault();
      const periodo = document.getElementById('regra-periodo').value;
      const minPontos = Number(document.getElementById('regra-pontos').value);
      const minOdd = Number(document.getElementById('regra-odd').value);
      if (!periodo || !Number.isFinite(minPontos) || minPontos < 1) {
        alert('Informe o período e os pontos (mínimo 1).');
        return;
      }
      if (!Number.isFinite(minOdd) || minOdd < 0) {
        alert('Informe a odd mínima (0 ou mais).');
        return;
      }
      void adicionarRegra(periodo, minPontos, minOdd)
        .then(() => {
          elFormRegra.reset();
        })
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
      fecharRegrasPopover();
    });

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
