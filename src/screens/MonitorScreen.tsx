import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { BetanoWebView, BetanoWebViewHandle } from '../components/BetanoWebView';
import { DebugBubble } from '../components/DebugBubble';
import { MonitorFabMenu } from '../components/MonitorFabMenu';
import {
  bootstrapMonitorNuvem,
  collectOnce,
  getMonitorSnapshot,
  startMonitor,
  stopMonitor,
  subscribeMonitorStatus,
} from '../services/monitorLoop';
import {
  entrarComEmailSenha,
  obterEmailSessao,
} from '../services/autenticacaoSupabase';
import {
  requestNotificationPermission,
  setupNotificationChannels,
} from '../services/notifications';
import { isExpoGoRuntime } from '../services/nativeCapabilities';
import {
  executarBetanoColeta,
  formatarColetaParaExibicao,
} from '../services/betanoColetaSupabase';
import {
  executarBetanoProbe,
  formatarProbeParaExibicao,
} from '../services/betanoProbeSupabase';
import { initStore } from '../services/store';
import { supabaseConfigurado } from '../services/supabase';

type BubbleKey =
  | 'monitor'
  | 'expoGo'
  | 'supabase'
  | 'webError'
  | 'login'
  | 'loginResult'
  | 'url'
  | 'probe'
  | 'coleta';

interface MonitorScreenProps {
  onAbrirHistorico: () => void;
}

export function MonitorScreen({ onAbrirHistorico }: MonitorScreenProps) {
  const webRef = useRef<BetanoWebViewHandle>(null);
  const [statusMessage, setStatusMessage] = useState('Inicializando...');
  const [webError, setWebError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastUrl, setLastUrl] = useState('');
  const [emailSessao, setEmailSessao] = useState<string | null>(null);
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  const [loginMsg, setLoginMsg] = useState<string | null>(null);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [coletaMsg, setColetaMsg] = useState<string | null>(null);
  const [coletaLoading, setColetaLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<BubbleKey>>(
    () => new Set(['login', 'url']),
  );

  function dismissBubble(key: BubbleKey) {
    setDismissed((prev) => new Set(prev).add(key));
  }

  function showBubble(key: BubbleKey) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  async function atualizarSessaoSupabase() {
    const email = await obterEmailSessao();
    setEmailSessao(email);
    showBubble('supabase');
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      await initStore();
      await setupNotificationChannels();
      await requestNotificationPermission();
      await atualizarSessaoSupabase();
      await bootstrapMonitorNuvem();

      if (!mounted) return;

      const snapshot = getMonitorSnapshot();
      setIsRunning(snapshot.isRunning);
      setStatusMessage(snapshot.lastMessage);
      showBubble('monitor');
      if (isExpoGoRuntime()) showBubble('expoGo');
    }

    bootstrap();

    const unsubscribe = subscribeMonitorStatus((message) => {
      setStatusMessage(message);
      setIsRunning(getMonitorSnapshot().isRunning);
      showBubble('monitor');
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (statusMessage) showBubble('monitor');
  }, [statusMessage]);

  useEffect(() => {
    if (webError) showBubble('webError');
  }, [webError]);

  useEffect(() => {
    showBubble('supabase');
  }, [emailSessao]);

  useEffect(() => {
    if (loginMsg) showBubble('loginResult');
  }, [loginMsg]);

  useEffect(() => {
    if (coletaMsg) showBubble('coleta');
  }, [coletaMsg]);

  useEffect(() => {
    if (probeMsg) showBubble('probe');
  }, [probeMsg]);

  useEffect(() => {
    if (lastUrl) showBubble('url');
  }, [lastUrl]);

  function closeMenu() {
    setMenuOpen(false);
  }

  async function handleStart() {
    closeMenu();
    setWebError(null);
    await startMonitor();
    setIsRunning(getMonitorSnapshot().isRunning);
    showBubble('monitor');
  }

  async function handleStop() {
    closeMenu();
    await stopMonitor();
    setIsRunning(false);
    showBubble('monitor');
  }

  async function handleCollectOnce() {
    closeMenu();
    setWebError(null);
    try {
      await collectOnce();
      showBubble('monitor');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha na coleta manual';
      setStatusMessage(message);
      showBubble('monitor');
    }
  }

  async function handleLogin() {
    setLoginMsg(null);
    const resultado = await entrarComEmailSenha(emailLogin, senhaLogin);
    setLoginMsg(resultado.mensagem);
    if (resultado.ok) {
      await atualizarSessaoSupabase();
      setSenhaLogin('');
      dismissBubble('login');
    }
    showBubble('loginResult');
  }

  function handleOpenLogin() {
    closeMenu();
    showBubble('login');
  }

  function handleHistorico() {
    closeMenu();
    onAbrirHistorico();
  }

  async function handleColeta() {
    closeMenu();
    setColetaLoading(true);
    setColetaMsg('Chamando Edge Function betano-coleta...');

    const { resultado, erro } = await executarBetanoColeta();
    setColetaLoading(false);

    if (erro || !resultado) {
      setColetaMsg(
        erro ??
          'Falha na coleta. Deploy: npm run deploy:coleta',
      );
      return;
    }

    setColetaMsg(formatarColetaParaExibicao(resultado));
  }

  async function handleProbe() {
    closeMenu();
    setProbeLoading(true);
    setProbeMsg('Chamando Edge Function betano-probe...');

    const { resultado, erro } = await executarBetanoProbe();
    setProbeLoading(false);

    if (erro || !resultado) {
      setProbeMsg(
        erro ??
          'Falha no probe. Deploy: npx supabase functions deploy betano-probe',
      );
      return;
    }

    setProbeMsg(formatarProbeParaExibicao(resultado));
  }

  const supabaseMessage = supabaseConfigurado
    ? emailSessao
      ? `logado (${emailSessao})`
      : 'não logado — histórico não será salvo'
    : 'configure EXPO_PUBLIC_SUPABASE_* no .env';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <BetanoWebView
        ref={webRef}
        onUrlChange={setLastUrl}
        onError={setWebError}
      />

      <MonitorFabMenu
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        isRunning={isRunning}
        onStart={handleStart}
        onStop={handleStop}
        onCollect={handleCollectOnce}
        onReload={() => {
          closeMenu();
          webRef.current?.reload();
        }}
        onHistorico={handleHistorico}
        onColeta={handleColeta}
        showColetaItem={supabaseConfigurado}
        onProbe={handleProbe}
        showProbeItem={supabaseConfigurado}
        onLogin={handleOpenLogin}
        showLoginItem={supabaseConfigurado && !emailSessao}
      />

      <ScrollView
        style={styles.bubbleColumn}
        contentContainerStyle={styles.bubbleColumnContent}
        pointerEvents="box-none"
        keyboardShouldPersistTaps="handled"
      >
        {!dismissed.has('monitor') ? (
          <DebugBubble
            title={isRunning ? 'Monitor ativo' : 'Monitor parado'}
            message={statusMessage}
            variant={isRunning ? 'success' : 'info'}
            onClose={() => dismissBubble('monitor')}
          />
        ) : null}

        {isExpoGoRuntime() && !dismissed.has('expoGo') ? (
          <DebugBubble
            title="Modo Expo Go"
            message={
              supabaseConfigurado
                ? 'Coleta automática na nuvem. Inicie após login. Alertas com app aberto.'
                : 'Use "Coletar agora". Monitor em background exige APK/dev client.'
            }
            variant="warn"
            onClose={() => dismissBubble('expoGo')}
          />
        ) : null}

        {!dismissed.has('supabase') ? (
          <DebugBubble
            title="Supabase"
            message={supabaseMessage}
            variant={emailSessao ? 'success' : 'info'}
            onClose={() => dismissBubble('supabase')}
          />
        ) : null}

        {lastUrl && !dismissed.has('url') ? (
          <DebugBubble
            title="URL WebView"
            message={lastUrl}
            variant="info"
            onClose={() => dismissBubble('url')}
          />
        ) : null}

        {webError && !dismissed.has('webError') ? (
          <DebugBubble
            title="Erro WebView"
            message={webError}
            variant="error"
            onClose={() => dismissBubble('webError')}
          />
        ) : null}

        {supabaseConfigurado && !emailSessao && !dismissed.has('login') ? (
          <DebugBubble
            title="Login Supabase"
            variant="info"
            onClose={() => dismissBubble('login')}
          >
            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor="#666"
              autoCapitalize="none"
              keyboardType="email-address"
              value={emailLogin}
              onChangeText={setEmailLogin}
            />
            <TextInput
              style={styles.input}
              placeholder="Senha"
              placeholderTextColor="#666"
              secureTextEntry
              value={senhaLogin}
              onChangeText={setSenhaLogin}
            />
            <Pressable style={styles.loginBtn} onPress={handleLogin}>
              <Text style={styles.loginBtnText}>Entrar</Text>
            </Pressable>
          </DebugBubble>
        ) : null}

        {loginMsg && !dismissed.has('loginResult') ? (
          <DebugBubble
            title="Login"
            message={loginMsg}
            variant={loginMsg.toLowerCase().includes('sessão') ? 'success' : 'error'}
            onClose={() => {
              dismissBubble('loginResult');
              setLoginMsg(null);
            }}
          />
        ) : null}

        {(coletaMsg || coletaLoading) && !dismissed.has('coleta') ? (
          <DebugBubble
            title="Coleta JSON (Supabase)"
            message={coletaLoading ? 'Buscando jogos ao vivo na API Betano...' : coletaMsg ?? ''}
            variant={
              coletaLoading
                ? 'info'
                : coletaMsg?.includes('ok=sim') && coletaMsg?.includes('jogos=') && !coletaMsg?.includes('jogos=0')
                  ? 'success'
                  : coletaMsg?.includes('bloqueio=sim') || coletaMsg?.includes('Falha')
                    ? 'error'
                    : 'warn'
            }
            onClose={() => {
              dismissBubble('coleta');
              setColetaMsg(null);
            }}
          />
        ) : null}

        {(probeMsg || probeLoading) && !dismissed.has('probe') ? (
          <DebugBubble
            title="Probe Betano (Supabase)"
            message={probeLoading ? 'Testando acesso à Betano na nuvem...' : probeMsg ?? ''}
            variant={
              probeLoading
                ? 'info'
                : probeMsg?.includes('promissor') || probeMsg?.includes('viável=sim')
                  ? 'success'
                  : probeMsg?.includes('Bloqueio') || probeMsg?.includes('Falha')
                    ? 'error'
                    : 'warn'
            }
            onClose={() => {
              dismissBubble('probe');
              setProbeMsg(null);
            }}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bubbleColumn: {
    position: 'absolute',
    top: 48,
    left: 68,
    right: 12,
    maxHeight: '55%',
    zIndex: 15,
  },
  bubbleColumnContent: {
    paddingBottom: 8,
  },
  input: {
    backgroundColor: '#222',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    marginTop: 8,
  },
  loginBtn: {
    marginTop: 8,
    backgroundColor: '#c45c00',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
