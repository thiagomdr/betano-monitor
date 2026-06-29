import { useState } from 'react';

import { HistoricoColetasScreen } from './src/screens/HistoricoColetasScreen';
import { MonitorScreen } from './src/screens/MonitorScreen';

type TelaAtiva = 'monitor' | 'historico';

export default function App() {
  const [tela, setTela] = useState<TelaAtiva>('monitor');

  if (tela === 'historico') {
    return <HistoricoColetasScreen onVoltar={() => setTela('monitor')} />;
  }

  return <MonitorScreen onAbrirHistorico={() => setTela('historico')} />;
}
