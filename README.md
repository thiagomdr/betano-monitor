# Betano Monitor

App Android pessoal para monitorar basquete ao vivo na Betano e alertar quando um time termina o 2º quarto com 10+ pontos de vantagem.

## Stack

- Expo SDK 54 (mesmo do app21)
- WebView com user-agent **Mobile Chrome**
- Parser local + fallback **GPT-4o-mini**
- SQLite local (alertas) + **Supabase** (histórico de coletas)
- Foreground Service (`react-native-background-actions`)

## Requisito importante

Este app **não roda completamente no Expo Go** — o monitor em background exige **development build** ou **APK** (`expo-dev-client`).

Para testar só a WebView, ainda pode usar Expo Go com limitações (sem foreground service).

## Configuração

1. Copie `.env.example` para `.env` e preencha `EXPO_PUBLIC_OPENAI_API_KEY` e Supabase.
2. Aplique a migration SQL — ver `supabase/README.md`.
3. Crie usuário no Supabase Auth e faça login no app.
4. Instale dependências:

```powershell
cd C:\Projetos\betano-monitor
npm install
```

## Testar no Expo Go (WebView)

**Use o script do projeto** — não rode `npx expo start` direto (com `expo-dev-client` instalado o QR vira development build e o Expo Go ignora).

```powershell
npm run start:clear
```

No terminal deve aparecer `› Using Expo Go` e `exp://192.168.x.x:8081`. Se ainda mostrar `development build`, pressione **`s`** no terminal para alternar.

## Rodar em desenvolvimento (dev client / APK)

Instale o dev client antes do build nativo:

```powershell
npx expo install expo-dev-client
npx expo prebuild --platform android
npx expo run:android
```

Depois do APK gerado:

```powershell
npm run start:dev
```

## Gerar APK release

```powershell
cd android
.\gradlew assembleRelease
```

APK em `android/app/build/outputs/apk/release/`.

## Painel web — histórico (Chrome)

URL pública (GitHub Pages):

**https://thiagomdr.github.io/betano-monitor/**

Deploy automático a cada `git push` em `main` (workflow `.github/workflows/deploy-historico-pages.yml`).

Config Supabase do painel: `web/historico/supabase.config.json` (chave **anon/publishable** — mesma do app).

### Ativar uma vez no GitHub

**Settings → Pages → Build and deployment → Source:** **GitHub Actions**

(Secrets em Actions são opcionais; sobrescrevem o `supabase.config.json` se definidos.)

### HTML local no celular (sem URL)

```powershell
npm run deploy:historico
```

Gera `web/historico/abrir-no-celular.html` — copie para o celular e abra no Chrome.

## Uso

1. Abra o app e aceite cookies na Betano.
2. Toque em **Basquete** se necessário.
3. **Coletar agora** — testa uma leitura imediata.
4. **Iniciar** — monitora a cada 4–8 min com notificação fixa.
5. Desative otimização de bateria para o app no Android.

## Alerta

Dispara quando: período anterior `Q2` → atual `Intervalo` ou `Q3`, e diferença de placar ≥ 10.

## Checklist do projeto

Progresso e próximos passos: **[docs/CHECKLIST.md](docs/CHECKLIST.md)**

O Agent deve atualizar esse arquivo conforme itens forem concluídos.

## Supabase (planejado)

Histórico de cada coleta na Betano será armazenado no Supabase (`coletas_betano`, `jogos_coleta`, `alertas_betano`). SQLite local continua responsável por alertas em tempo real.
