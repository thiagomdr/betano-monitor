import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { BETANO_LIVE_URL, USER_AGENT_MOBILE_CHROME } from '../constants';
import { debugLog } from '../services/debugLog';
import {
  CLICK_BASKETBALL_JS,
  EXTRACT_PAGE_TEXT_JS,
  NAVIGATE_TO_URL_JS,
} from '../services/extractScript';
import {
  handleWebViewMessage,
  notifyPageLoadComplete,
  registerWebViewActions,
  unregisterWebViewActions,
} from '../services/scrapeBridge';

export interface BetanoWebViewHandle {
  reload: () => void;
}

interface BetanoWebViewProps {
  onLoadStateChange?: (loading: boolean) => void;
  onUrlChange?: (url: string) => void;
  onError?: (message: string) => void;
}

export const BetanoWebView = forwardRef<BetanoWebViewHandle, BetanoWebViewProps>(
  function BetanoWebView({ onLoadStateChange, onUrlChange, onError }, ref) {
    const webRef = useRef<WebView>(null);
    const [loading, setLoading] = useState(true);

    useImperativeHandle(ref, () => ({
      reload: () => webRef.current?.reload(),
    }));

    useEffect(() => {
      registerWebViewActions({
        scrape: () => webRef.current?.injectJavaScript(EXTRACT_PAGE_TEXT_JS),
        clickBasketball: () => webRef.current?.injectJavaScript(CLICK_BASKETBALL_JS),
        navigate: (url: string) => webRef.current?.injectJavaScript(NAVIGATE_TO_URL_JS(url)),
      });

      return () => unregisterWebViewActions();
    }, []);

    return (
      <View style={styles.wrap}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#c45c00" />
            <Text style={styles.loadingText}>Carregando Betano...</Text>
          </View>
        ) : null}
        <WebView
          ref={webRef}
          source={{ uri: BETANO_LIVE_URL }}
          userAgent={USER_AGENT_MOBILE_CHROME}
          applicationNameForUserAgent=""
          onLoadStart={() => {
            setLoading(true);
            onLoadStateChange?.(true);
          }}
          onLoadEnd={() => {
            setLoading(false);
            onLoadStateChange?.(false);
            notifyPageLoadComplete();
          }}
          onNavigationStateChange={(nav) => {
            // #region agent log
            debugLog(
              'BetanoWebView.tsx:onNavigationStateChange',
              'url webview',
              { url: nav.url, title: nav.title, loading: nav.loading },
              'H1',
            );
            // #endregion
            onUrlChange?.(nav.url);
          }}
          onError={(e) => onError?.(e.nativeEvent.description)}
          onHttpError={(e) => {
            // #region agent log
            debugLog(
              'BetanoWebView.tsx:onHttpError',
              'http erro webview',
              { statusCode: e.nativeEvent.statusCode, url: e.nativeEvent.url },
              'H1',
            );
            // #endregion
            onError?.(`HTTP ${e.nativeEvent.statusCode} em ${e.nativeEvent.url}`);
          }}
          onMessage={(event) => handleWebViewMessage(event.nativeEvent.data)}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          style={styles.webview}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1 },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    zIndex: 1,
  },
  loadingText: { color: '#aaa', marginTop: 8 },
});
