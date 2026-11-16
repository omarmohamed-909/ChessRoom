'use client';
import { useEffect, useRef, useState } from 'react';
import { Globe2, LoaderCircle, Volume2, VolumeX, X } from 'lucide-react';
import { COLORS, SKINS, type Skin } from '@chaos/shared';
import { useConnection, serverUrl } from '../lib/client';
import { errorText, gameText, words, type Lang } from '../lib/i18n';
import Avatar from './Avatar';
import type { Settings } from './GameBoard';
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';
import MatchScreen from './screens/MatchScreen';
import ResultsScreen from './screens/ResultsScreen';
import ModalDialog, { type Modal } from './screens/ModalDialog';

const defaults: Settings = { sound: true, music: false, motion: false, mute: false };

export default function App() {
  const connection = useConnection(),
    { state, identity } = connection;
  const [lang, setLang] = useState<Lang>('ar'),
    [name, setName] = useState(''),
    [skin, setSkin] = useState<Skin>('sprout'),
    [modal, setModal] = useState<Modal>(null),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [settings, setSettings] = useState(defaults),
    [copied, setCopied] = useState(false),
    [feedback, setFeedback] = useState(''),
    [sent, setSent] = useState(false),
    [now, setNow] = useState(Date.now()),
    [loaded, setLoaded] = useState(false);

  const t = words[lang],
    games = gameText[lang],
    dialog = useRef<HTMLDialogElement>(null),
    toast = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    lastPhase = useRef('');
  const isHost = state?.hostId === identity?.id;

  useEffect(() => {
    try {
      setLang(localStorage.getItem('chaos.lang') === 'en' ? 'en' : 'ar');
      setName(localStorage.getItem('chaos.name') || '');
      const savedSkin = localStorage.getItem('chaos.skin');
      if (SKINS.includes(savedSkin as Skin)) setSkin(savedSkin as Skin);
      setSettings({ ...defaults, ...JSON.parse(localStorage.getItem('chaos.settings') || '{}') });
    } catch {}
    setLoaded(true);
    const invite = window.location.pathname.match(/^\/room\/([A-Z2-9]{6})\/?$/i);
    if (invite) {
      setCode(invite[1].toUpperCase());
      setModal('join');
    }
    return () => clearTimeout(toast.current);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (loaded) localStorage.setItem('chaos.lang', lang);
  }, [lang, loaded]);

  useEffect(() => {
    if (identity?.user && SKINS.includes(identity.user.skin as Skin))
      setSkin(identity.user.skin as Skin);
  }, [identity?.id, identity?.user?.skin]);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem('chaos.name', name);
      localStorage.setItem('chaos.skin', skin);
      localStorage.setItem('chaos.settings', JSON.stringify(settings));
      document.documentElement.dataset.motion = settings.motion ? 'reduced' : 'full';
    }
  }, [name, skin, settings, loaded]);

  useEffect(() => {
    if (state) {
      history.replaceState(null, '', `/room/${state.code}`);
      setModal((m) => (m === 'create' || m === 'join' ? null : m));
    }
  }, [state?.code]);

  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    setError('');
    setSent(false);
  }, [modal]);

  useEffect(() => {
    if (connection.notice) {
      setError(errorText(connection.notice, lang));
      toast.current = setTimeout(() => {
        setError('');
        connection.setNotice('');
      }, 6000);
    }
  }, [connection.notice]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (state?.phase !== lastPhase.current) {
      lastPhase.current = state?.phase || '';
      if (settings.sound && state && ['reveal', 'finished', 'roundResults'].includes(state.phase))
        import('./GameBoard').then((m) => m.tone(state.phase === 'finished' ? 880 : 520, 0.2));
    }
  }, [state?.phase, settings.sound]);

  useEffect(() => {
    if (!settings.music || !state || !['vote', 'playing'].includes(state.phase)) return;
    const notes = [220, 277, 330, 277];
    let i = 0;
    const timer = setInterval(() => {
      import('./GameBoard').then((m) => m.tone(notes[i++ % 4], 0.5, 0.008));
    }, 1200);
    return () => clearInterval(timer);
  }, [settings.music, state?.phase]);

  async function command(data: Record<string, unknown>, silent = false) {
    const ack = await connection.send(data);
    if (!ack.ok && !silent) setError(errorText(ack.error || '', lang));
    return ack;
  }

  async function enter(type: 'create' | 'join', training = false) {
    setBusy(true);
    setError('');
    try {
      const ack = await command(
        type === 'create'
          ? { type, name: name.trim() || (lang === 'ar' ? 'لاعب' : 'Player'), skin, training }
          : {
              type,
              name: name.trim() || (lang === 'ar' ? 'لاعب' : 'Player'),
              skin,
              code: code.trim().toUpperCase(),
            },
      );
      if (ack.ok) {
        setModal(null);
        if (training) await command({ type: 'start' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    const ack = await command({ type: 'leave' });
    if (ack.ok) {
      connection.setState(null);
      history.replaceState(null, '', '/');
      setError('');
    }
  }

  async function invite() {
    const url = `${location.origin}/room/${state?.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`${lang === 'ar' ? 'رابط الدعوة' : 'Invite link'}: ${url}`);
    }
  }

  async function saveSkin(value: Skin) {
    setSkin(value);
    if (state) await command({ type: 'appearance', skin: value });
    if (identity?.storage === 'mongo') {
      try {
        const response = await fetch(`${serverUrl()}/api/skin`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skin: value }),
        });
        if (!response.ok) throw new Error();
      } catch {
        setError(
          lang === 'ar'
            ? 'اتحفظت على الجهاز؛ تعذر الحفظ في الحساب'
            : 'Saved on this device; account sync failed',
        );
      }
    }
  }

  async function report() {
    if (feedback.trim().length < 5) return;
    setBusy(true);
    try {
      const response = await fetch(`${serverUrl()}/api/feedback`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: feedback, matchId: state?.matchId || undefined }),
      });
      if (!response.ok) throw new Error();
      setSent(true);
      setFeedback('');
    } catch {
      setError(errorText('OFFLINE', lang));
    } finally {
      setBusy(false);
    }
  }

  const received = useRef({ server: 0, local: 0 });
  if (state && received.current.server !== state.serverTime)
    received.current = { server: state.serverTime, local: Date.now() };
  const clock = received.current.server + (now - received.current.local),
    remaining = state ? Math.max(0, Math.ceil((state.endsAt - clock) / 1000)) : 0;
  const waiting = state && ['lobby'].includes(state.phase),
    results = state && ['finished', 'cancelled'].includes(state.phase);

  return (
    <div className="app-shell">
      <header className="header">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            if (state) {
              e.preventDefault();
              setModal('help');
            }
          }}
          aria-label="CHAOS ROOM"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            CHAOS
            <span className="brand-room">
              ROOM<span className="brand-dot">.</span>
            </span>
          </span>
        </a>
        <nav
          className="nav-links"
          aria-label={lang === 'ar' ? 'القائمة الرئيسية' : 'Main navigation'}
        >
          <button onClick={() => setModal('help')}>
            {lang === 'ar' ? 'إزاي تلعب؟' : 'How to play'}
          </button>
          <button onClick={() => setModal('wardrobe')}>
            {t.wardrobe}
            <span className="nav-new">{lang === 'ar' ? 'جديد' : 'NEW'}</span>
          </button>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button lang-button"
            onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
            aria-label="Switch language"
          >
            <Globe2 size={17} />
            <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </button>
          <button
            className="icon-button sound-button"
            onClick={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
            aria-label={t.sound}
            aria-pressed={settings.sound}
          >
            {settings.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <button
            className="profile-button"
            onClick={() => setModal('account')}
            aria-label={t.account}
          >
            <Avatar color={COLORS[0]} skin={skin} size={34} />
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="toast">
          <span>{error}</span>
          <button className="icon-button" aria-label={t.close} onClick={() => setError('')}>
            <X size={17} />
          </button>
        </div>
      )}

      {connection.connection !== 'online' && state && (
        <div role="status" className="connection-banner">
          <LoaderCircle size={16} className="spin" />
          {t[connection.connection]}
          <button onClick={connection.retry}>{t.retry}</button>
        </div>
      )}

      {!state && (
        <HomeScreen
          lang={lang}
          t={t}
          games={games}
          busy={busy}
          connection={connection.connection}
          onCreate={() => setModal('create')}
          onJoin={() => setModal('join')}
          onHelp={() => setModal('help')}
          onTraining={() => {
            if (!name) setName(lang === 'ar' ? 'لاعب' : 'Player');
            void enter('create', true);
          }}
        />
      )}

      {waiting && state && (
        <LobbyScreen
          lang={lang}
          t={t}
          games={games}
          state={state}
          identity={identity}
          isHost={isHost}
          command={command}
          leave={leave}
          invite={invite}
          copied={copied}
        />
      )}

      {state && !waiting && !results && (
        <MatchScreen
          lang={lang}
          t={t}
          games={games}
          state={state}
          identity={identity}
          isHost={isHost}
          command={command}
          leave={leave}
          invite={invite}
          copied={copied}
          socket={connection.socket.current}
          settings={settings}
          clock={clock}
          remaining={remaining}
          onOpenSettings={() => setModal('settings')}
        />
      )}

      {results && state && (
        <ResultsScreen
          lang={lang}
          t={t}
          games={games}
          state={state}
          identity={identity}
          isHost={isHost}
          command={command}
          leave={leave}
          invite={invite}
          copied={copied}
        />
      )}

      <footer className="footer">
        <span>
          <span className="footer-logo">CHAOS ROOM.</span>
          <span>
            {lang === 'ar'
              ? 'الخناقة الوحيدة اللي آخرها ريماتش.'
              : 'A little rivalry. A lot of rematches.'}
          </span>
        </span>
        <div>
          <button onClick={() => setModal('help')}>{t.help}</button>
          <button onClick={() => setModal('settings')}>{t.settings}</button>
          <button
            className={`server-status status-${connection.connection}`}
            onClick={connection.retry}
          >
            <i />
            {t[connection.connection]}
          </button>
          <small>v0.2 · BETA</small>
        </div>
      </footer>

      {modal && (
        <ModalDialog
          dialog={dialog}
          modal={modal}
          setModal={setModal}
          lang={lang}
          t={t}
          name={name}
          setName={setName}
          code={code}
          setCode={setCode}
          skin={skin}
          saveSkin={saveSkin}
          settings={settings}
          setSettings={setSettings}
          identity={identity}
          connection={connection.connection}
          busy={busy}
          error={error}
          feedback={feedback}
          setFeedback={setFeedback}
          sent={sent}
          onEnter={(m) => enter(m)}
          onReport={report}
        />
      )}
    </div>
  );
}
