import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  CircleUserRound,
  HelpCircle,
  LoaderCircle,
  ShieldCheck,
  Shirt,
  X,
} from 'lucide-react';
import { COLORS, SKINS, type Skin } from '@chaos/shared';
import { serverUrl, type Identity } from '../../lib/client';
import type { Lang } from '../../lib/i18n';
import Avatar from '../Avatar';
import type { Settings } from '../GameBoard';
import type { Connection, Words } from './types';

export type Modal = 'create' | 'join' | 'settings' | 'wardrobe' | 'account' | 'help' | null;

type Props = {
  dialog: RefObject<HTMLDialogElement | null>;
  modal: Exclude<Modal, null>;
  setModal: (m: Modal) => void;
  lang: Lang;
  t: Words;
  name: string;
  setName: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  skin: Skin;
  saveSkin: (value: Skin) => Promise<void>;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  identity: Identity | null;
  connection: Connection;
  busy: boolean;
  error: string;
  feedback: string;
  setFeedback: (v: string) => void;
  sent: boolean;
  onEnter: (type: 'create' | 'join') => Promise<void>;
  onReport: () => Promise<void>;
};

export default function ModalDialog({
  dialog,
  modal,
  setModal,
  lang,
  t,
  name,
  setName,
  code,
  setCode,
  skin,
  saveSkin,
  settings,
  setSettings,
  identity,
  connection,
  busy,
  error,
  feedback,
  setFeedback,
  sent,
  onEnter,
  onReport,
}: Props) {
  const Arrow = lang === 'ar' ? ArrowUpLeft : ArrowUpRight;
  const ar = lang === 'ar';
  const title = {
    create: t.play,
    join: t.join,
    settings: t.settings,
    wardrobe: t.wardrobe,
    account: t.account,
    help: t.help,
  }[modal];

  return (
    <dialog
      ref={dialog}
      className={`modal modal-${modal}`}
      aria-labelledby="modal-title"
      onCancel={() => setModal(null)}
      onClick={(e) => {
        if (e.target === e.currentTarget) setModal(null);
      }}
    >
      <div className="modal-heading">
        <span className="section-kicker">CHAOS ROOM / {modal.toUpperCase()}</span>
        <button className="icon-button" aria-label={t.close} onClick={() => setModal(null)}>
          <X size={20} />
        </button>
      </div>
      <h2 id="modal-title">
        {title}
        <span className="accent">.</span>
      </h2>
      {(modal === 'create' || modal === 'join') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onEnter(modal);
          }}
        >
          <div className="form-avatar">
            <Avatar skin={skin} size={90} />
            <button type="button" onClick={() => setModal('wardrobe')}>
              <Shirt size={16} />
              {t.wardrobe}
            </button>
          </div>
          <label>
            {t.name}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={18}
              pattern="[\p{L}\p{N} _\.\-]+"
              placeholder={ar ? 'هنناديك بإيه؟' : 'What should we call you?'}
              required
            />
          </label>
          {modal === 'join' && (
            <label>
              {t.code}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                dir="ltr"
                className="code-input"
                maxLength={6}
                minLength={6}
                pattern="[A-Z2-9]{6}"
                placeholder="ABC234"
                required
              />
            </label>
          )}
          <button className="button primary full" disabled={busy || connection !== 'online'}>
            {busy ? <LoaderCircle size={18} className="spin" /> : <Arrow size={18} />}{' '}
            {modal === 'create' ? t.create : t.enter}
          </button>
          <p className="form-note">
            <ShieldCheck size={14} />
            {t.guest}
          </p>
          {connection !== 'online' && (
            <p role="status" className="form-error">
              {t[connection]}
            </p>
          )}
        </form>
      )}
      {modal === 'settings' && (
        <div className="settings-list">
          {(['sound', 'music', 'motion', 'mute'] as const).map((key) => (
            <label className="setting-row" key={key}>
              <span>{t[key]}</span>
              <input
                type="checkbox"
                role="switch"
                checked={settings[key]}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))}
              />
            </label>
          ))}
        </div>
      )}
      {modal === 'wardrobe' && (
        <>
          <p className="modal-description">
            {t.preview}. {t.locked}.
          </p>
          <div className="wardrobe-grid">
            {SKINS.map((s, i) => (
              <button
                key={s}
                className={s === skin ? 'selected' : ''}
                onClick={() => void saveSkin(s)}
                aria-pressed={skin === s}
              >
                <Avatar skin={s} color={COLORS[i]} size={90} />
                <strong>
                  {
                    (ar
                      ? ['الكلاسيكي', 'نبتة الفوضى', 'ملك الأوضة', 'دي جي', 'نينجا']
                      : ['Classic', 'Little sprout', 'Room royalty', 'DJ chaos', 'Ninja'])[i]
                  }
                </strong>
                <span>{s === skin ? <Check size={14} /> : t.free}</span>
              </button>
            ))}
          </div>
          <button className="button primary full" onClick={() => setModal(null)}>
            {t.save}
            <Check size={17} />
          </button>
        </>
      )}
      {modal === 'account' && (
        <div className="account-content">
          <Avatar skin={skin} size={110} />
          <p>{identity?.user ? `${t.linked}: ${identity.user.name}` : t.noAccount}</p>
          {!identity?.user &&
            (identity?.googleEnabled ? (
              <a
                className="button secondary full"
                href={`${serverUrl()}/auth/google`}
                onClick={async (e) => {
                  e.preventDefault();
                  await saveSkin(skin);
                  window.location.assign(`${serverUrl()}/auth/google`);
                }}
              >
                <CircleUserRound size={18} />
                {t.google}
              </a>
            ) : (
              <div className="info-note">{t.googleUnavailable}</div>
            ))}
        </div>
      )}
      {modal === 'help' && (
        <div className="help-content">
          <div className="help-rules">
            <p>
              <b>01</b>
              {ar
                ? '٨ ثواني تختار فيهم القاعدة بالحركة.'
                : '8 seconds to vote by moving into a zone.'}
            </p>
            <p>
              <b>02</b>
              {ar
                ? 'الأغلبية تختار، والأقلية تاخد اندفاع إضافي.'
                : 'The majority picks the rule. The minority gets a bonus dash.'}
            </p>
            <p>
              <b>03</b>
              {ar ? '٣ جولات، واجمع أعلى مجموع نقاط.' : '3 rounds. Highest total score wins.'}
            </p>
          </div>
          <p className="help-controls">{t.controls}</p>
          <h3>{t.report}</h3>
          {sent ? (
            <p className="success-message">
              <Check size={18} />
              {t.sent}
            </p>
          ) : (
            <>
              <textarea
                aria-label={t.report}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                minLength={5}
                maxLength={1000}
                placeholder={
                  ar
                    ? 'إيه اللي حصل؟ ولو فيه خطوات للمشكلة اكتبها.'
                    : 'What happened? Include steps if possible.'
                }
              />
              <button
                className="button secondary full"
                disabled={busy || feedback.trim().length < 5}
                onClick={() => void onReport()}
              >
                {busy ? <LoaderCircle className="spin" size={17} /> : <HelpCircle size={17} />}{' '}
                {t.send}
              </button>
            </>
          )}
          <p className="form-note">
            {ar
              ? 'بنحفظ اسمك ونتائج اللعب وبلاغات الأعطال. من غير شات أو تسجيل صوت.'
              : 'We store your profile, match results, and issue reports. No chat or voice recording.'}
          </p>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
