import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import {
  formatarCabecalhoJogoHistorico,
  formatarDetalhePeriodoHistorico,
  formatarHoraHistorico,
  formatarMetaJogoHistorico,
  formatarOdd,
  blocoPeriodoComTempo,
  formatarPeriodoExibicao,
  rotuloEstadoHistorico,
} from '../services/historicoDisplay';
import { listarHistoricoPorJogo } from '../services/historicoColetasSupabase';
import type { EntradaHistoricoJogo, JogoHistoricoGrupo } from '../types/coleta';
import { supabaseConfigurado } from '../services/supabase';

interface HistoricoColetasScreenProps {
  onVoltar: () => void;
}

function formatarHora(iso: string): string {
  return formatarHoraHistorico(iso);
}

function formatarCabecalhoJogo(jogo: JogoHistoricoGrupo): string {
  return formatarCabecalhoJogoHistorico(jogo);
}

function TimelineEntrada({
  entrada,
  timeCasa,
  timeFora,
}: {
  entrada: EntradaHistoricoJogo;
  timeCasa: string;
  timeFora: string;
}) {
  const hora = formatarHora(entrada.coletadoEm);
  const placar = `${timeCasa} ${entrada.placarCasa} x ${entrada.placarFora} ${timeFora}`;

  return (
    <View style={styles.timelineItem}>
      <Text style={styles.timelineMarcador}>»</Text>
      <View style={styles.timelineConteudo}>
        <View style={styles.timelineLinha1}>
          <Text style={styles.timelineHora}>{hora}</Text>
          <Text style={styles.timelinePlacar}> {placar}</Text>
        </View>
        <View style={styles.timelineLinha2}>
          <Text style={styles.timelineHoraEspaco}>{hora}</Text>
          <Text style={styles.timelineDetalhe}>
            {' '}
            ({formatarDetalhePeriodoHistorico(entrada)})
          </Text>
        </View>
      </View>
    </View>
  );
}

function JogoCard({
  jogo,
  expandido,
  onToggle,
}: {
  jogo: JogoHistoricoGrupo;
  expandido: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        style={styles.cardHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: expandido }}
      >
        <Text style={styles.expandIcon}>{expandido ? '▼' : '▶'}</Text>
        <View style={styles.cardHeaderTexto}>
          <Text style={styles.cardTitulo}>{formatarCabecalhoJogo(jogo)}</Text>
          {jogo.liga ? <Text style={styles.cardLiga}>{jogo.liga}</Text> : null}
          <Text style={styles.cardMeta}>{formatarMetaJogoHistorico(jogo)}</Text>
        </View>
      </Pressable>

      {expandido ? (
        <View style={styles.timeline}>
          {jogo.entradas.map((entrada) => (
            <TimelineEntrada
              key={entrada.id}
              entrada={entrada}
              timeCasa={jogo.timeCasa}
              timeFora={jogo.timeFora}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function HistoricoColetasScreen({ onVoltar }: HistoricoColetasScreenProps) {
  const [jogos, setJogos] = useState<JogoHistoricoGrupo[]>([]);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    else setAtualizando(true);

    const resultado = await listarHistoricoPorJogo();
    setJogos(resultado.jogos);
    setErro(resultado.erro);
    setCarregando(false);
    setAtualizando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const toggleJogo = useCallback((gameKey: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(gameKey)) next.delete(gameKey);
      else next.add(gameKey);
      return next;
    });
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Pressable style={styles.voltarBtn} onPress={onVoltar}>
          <Text style={styles.voltarTexto}>← Voltar</Text>
        </Pressable>
        <Text style={styles.title}>Histórico por jogo</Text>
        <Text style={styles.subtitle}>Linha do tempo das coletas no Supabase</Text>
      </View>

      {!supabaseConfigurado ? (
        <View style={styles.centro}>
          <Text style={styles.aviso}>
            Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no `.env`
          </Text>
        </View>
      ) : carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color="#c45c00" size="large" />
        </View>
      ) : erro ? (
        <View style={styles.centro}>
          <Text style={styles.erroTexto}>{erro}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void carregar()}>
            <Text style={styles.retryTexto}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : jogos.length === 0 ? (
        <View style={styles.centro}>
          <Text style={styles.aviso}>
            Nenhum jogo registrado ainda. Use &quot;Coletar agora&quot; ou o monitor com login
            no Supabase.
          </Text>
        </View>
      ) : (
        <FlatList
          data={jogos}
          keyExtractor={(item) => item.gameKey}
          renderItem={({ item }) => (
            <JogoCard
              jogo={item}
              expandido={expandidos.has(item.gameKey)}
              onToggle={() => toggleJogo(item.gameKey)}
            />
          )}
          contentContainerStyle={styles.lista}
          refreshControl={
            <RefreshControl
              refreshing={atualizando}
              onRefresh={() => void carregar(true)}
              tintColor="#c45c00"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },
  header: {
    paddingTop: 48,
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  voltarBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  voltarTexto: { color: '#c45c00', fontSize: 14, fontWeight: '600' },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#aaa', fontSize: 12 },
  centro: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  aviso: { color: '#999', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  lista: { padding: 12, paddingBottom: 32 },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  expandIcon: {
    color: '#c45c00',
    fontSize: 12,
    marginTop: 3,
    width: 14,
  },
  cardHeaderTexto: { flex: 1, gap: 2 },
  cardTitulo: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  cardLiga: { color: '#8ab4f8', fontSize: 11 },
  cardMeta: { color: '#888', fontSize: 11 },
  timeline: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    paddingTop: 8,
    gap: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  timelineMarcador: {
    color: '#c45c00',
    fontSize: 12,
    lineHeight: 18,
    width: 12,
  },
  timelineConteudo: { flex: 1, gap: 2 },
  timelineLinha1: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  timelineLinha2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  timelineHora: {
    color: '#ccc',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
    width: 42,
  },
  timelineHoraEspaco: {
    fontSize: 12,
    lineHeight: 16,
    width: 42,
    opacity: 0,
  },
  timelinePlacar: {
    color: '#ccc',
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  timelineDetalhe: {
    color: '#999',
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  erroTexto: { color: '#ff6b6b', fontSize: 12, textAlign: 'center' },
  retryBtn: {
    alignSelf: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryTexto: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
