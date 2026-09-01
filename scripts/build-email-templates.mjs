#!/usr/bin/env node
// Generate the six localised Supabase auth-email templates from a base layout +
// supabase/templates/i18n.json, and rewrite the marked block in
// supabase/config.toml with the matching (localised) subjects.
//
//   node scripts/build-email-templates.mjs
//
// Supabase renders templates (and subjects) through Go's text/template, and
// exposes the user's metadata as {{ .Data }}. The app writes `locale` into that
// metadata at sign-up (AuthContext.tsx), so a single template can switch on
// {{ .Data.locale }}. Unknown / missing locale falls through to English.
//
// Outputs:
//   supabase/templates/{confirmation,invite,magic_link,email_change,recovery,reauthentication}.html
//   supabase/templates/_generated/subjects.json   (consumed by push-auth-emails.mjs)
//   supabase/config.toml                          (block between the BEGIN/END markers)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TPL_DIR = join(ROOT, 'supabase', 'templates');
const GEN_DIR = join(TPL_DIR, '_generated');
const CONFIG = join(ROOT, 'supabase', 'config.toml');

const i18n = JSON.parse(await readFile(join(TPL_DIR, 'i18n.json'), 'utf8'));
const FALLBACK = 'en';
const EXTRA = i18n.locales.filter((l) => l !== FALLBACK); // it, fr, es, de, pt, nl

// --- helpers ---------------------------------------------------------------

const htmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Build a Go text/template locale switch from a {en,it,fr,…} string map.
// `html` escapes the leaf text for an HTML context; subjects pass it raw.
function sw(map, { html = true } = {}) {
  const leaf = (l) => {
    const v = map[l];
    if (v == null) throw new Error(`i18n.json: missing "${l}" in ${JSON.stringify(map)}`);
    return html ? htmlEsc(v) : v;
  };
  let out = '';
  EXTRA.forEach((l, i) => {
    out += `{{${i === 0 ? 'if' : 'else if'} eq .Data.locale "${l}"}}${leaf(l)}`;
  });
  return `${out}{{else}}${leaf(FALLBACK)}{{end}}`;
}

// Widest localised button label → a fixed VML width for Outlook (it can't
// shrink-to-fit). Non-Outlook clients use the padded <a> and ignore this.
function vmlWidth(map) {
  const longest = Math.max(...i18n.locales.map((l) => map[l].length));
  return Math.max(150, Math.round(longest * 8.6 + 64));
}

// --- shared chrome -------------------------------------------------------

const STYLE = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
  body { margin:0; padding:0; width:100% !important; height:100% !important; }
  a { color:#4f7458; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .py { padding-top:32px !important; padding-bottom:32px !important; }
  }
  @media (prefers-color-scheme: dark) {
    body, .bg-ground { background:#12150e !important; }
    .card { background:#1e2318 !important; border-color:#2a3222 !important; }
    .ink { color:#e7ece0 !important; }
    .muted { color:#9aa896 !important; }
    .faint { color:#6c7a68 !important; }
    .wm-light { display:none !important; }
    .wm-dark { display:block !important; }
    .well { background:#171b12 !important; }
    .code-box { color:#e7ece0 !important; }
    .hr { border-color:#2a3222 !important; }
    .btn-a { background:#8fb896 !important; color:#12150e !important; }
    .link { color:#8fb896 !important; }
  }
  [data-ogsc] body, [data-ogsc] .bg-ground { background:#12150e !important; }
  [data-ogsc] .card { background:#1e2318 !important; border-color:#2a3222 !important; }
  [data-ogsc] .ink { color:#e7ece0 !important; }
  [data-ogsc] .muted { color:#9aa896 !important; }
  [data-ogsc] .faint { color:#6c7a68 !important; }
  [data-ogsc] .wm-light { display:none !important; }
  [data-ogsc] .wm-dark { display:block !important; }
  [data-ogsc] .well { background:#171b12 !important; }
  [data-ogsc] .code-box { color:#e7ece0 !important; }
  [data-ogsc] .btn-a { background:#8fb896 !important; color:#12150e !important; }
  [data-ogsc] .link { color:#8fb896 !important; }`;

const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const MONO = `'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace`;
const SPACER = '&#847;&zwnj;&nbsp;'.repeat(6);

const HEADER = `          <tr>
            <td align="center" style="padding:4px 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td style="vertical-align:middle;padding-right:13px;">
                    <img src="https://etto.fitness/email/etto-icon.png" width="46" height="46" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:46px;height:46px;">
                  </td>
                  <td style="vertical-align:middle;">
                    <img src="https://etto.fitness/email/etto-wordmark.png" width="118" height="38" alt="Etto" class="wm-light" style="display:block;border:0;outline:none;text-decoration:none;width:118px;height:38px;">
                    <img src="https://etto.fitness/email/etto-wordmark-dark.png" width="118" height="38" alt="Etto" class="wm-dark" style="display:none;border:0;outline:none;text-decoration:none;width:118px;height:38px;mso-hide:all;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

const footer = () => `          <tr>
            <td align="center" class="faint" style="font-family:${SANS};font-size:12px;line-height:1.7;color:#8a9887;padding:24px 16px 8px;">
              Etto &middot; <a href="https://etto.fitness" class="link" style="color:#8a9887;text-decoration:underline;">etto.fitness</a><br>
              ${sw(i18n.common.tagline)}
            </td>
          </tr>`;

// --- row builders ------------------------------------------------------

const heading = (t) =>
  `                <tr>
                  <td class="ink" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;line-height:1.25;color:#2f3a32;padding-bottom:14px;">${sw(t)}</td>
                </tr>`;

const body = (t, pb = 28) =>
  `                <tr>
                  <td class="muted" style="font-family:${SANS};font-size:15px;line-height:1.65;color:#5c6b5e;padding-bottom:${pb}px;">
                    ${sw(t)}
                  </td>
                </tr>`;

const button = (label, padStyle = 'padding-bottom:28px;') =>
  `                <tr>
                  <td align="center" style="${padStyle}">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{ .ConfirmationURL }}" style="height:46px;v-text-anchor:middle;width:${vmlWidth(label)}px;" arcsize="22%" strokecolor="#4f7458" fillcolor="#4f7458">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${sw(label)}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a class="btn-a" href="{{ .ConfirmationURL }}" style="display:inline-block;background:#4f7458;color:#ffffff;font-family:${SANS};font-size:16px;font-weight:600;line-height:1;text-decoration:none;padding:15px 30px;border-radius:10px;">${sw(label)}</a>
                    <!--<![endif]-->
                  </td>
                </tr>`;

const codeWell = (label, { pad = '18px 16px 20px', labelPb = 8, size = 28, ls = 6 } = {}) =>
  `                <tr>
                  <td align="center" class="well" style="background:#eef1e6;border-radius:12px;padding:${pad};">
                    <div class="faint" style="font-family:${SANS};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#8a9887;padding-bottom:${labelPb}px;">${sw(label)}</div>
                    <div class="code-box ink" style="font-family:${MONO};font-size:${size}px;font-weight:700;letter-spacing:${ls}px;color:#2f3a32;">{{ .Token }}</div>
                  </td>
                </tr>`;

const linkRows = (introStyle) =>
  `                <tr>
                  <td class="faint" style="font-family:${SANS};font-size:13px;line-height:1.6;color:#8a9887;${introStyle}">${sw(i18n.common.linkIntro)}</td>
                </tr>
                <tr>
                  <td style="font-family:${SANS};font-size:13px;line-height:1.6;word-break:break-all;padding-bottom:26px;">
                    <a class="link" href="{{ .ConfirmationURL }}" style="color:#4f7458;">{{ .ConfirmationURL }}</a>
                  </td>
                </tr>`;

/**
 * A secondary "Open in the Etto app" link, using the etto:// custom scheme —
 * alongside `linkRows`' primary https://etto.fitness one, never instead of
 * it. See src/lib/deepLinks.ts's header comment for why this carries
 * `{{ .Email }}`/`{{ .Token }}` rather than trying to reuse
 * `{{ .ConfirmationURL }}`'s own tokens, and scripts/patch-ios-project.mjs /
 * patch-android-manifest.mjs for where the native side registers the scheme.
 *
 * `verifyType` is this template's own flow — 'recovery' here, 'signup' for
 * confirmation.html, 'magiclink' for magic_link.html — spelled exactly as
 * `EmailOtpType` in @supabase/auth-js, since `src/lib/deepLinks.ts` passes it
 * straight through to `supabase.auth.verifyOtp({ type })` unchanged.
 *
 * `&amp;` between the query params is not decorative: this string is HTML
 * template *source*, not a value Go's html/template will autoescape for us —
 * an unescaped literal `&` in a hand-written attribute is invalid HTML.
 * `{{ .Email }}` sitting inside an href's query-string position *is* one of
 * html/template's documented auto-escaping contexts, so that variable itself
 * needs no explicit encoding here.
 */
const appLinkRow = (verifyType) =>
  `                <tr>
                  <td class="faint" style="font-family:${SANS};font-size:13px;line-height:1.6;color:#8a9887;padding-top:2px;padding-bottom:10px;">${sw(i18n.common.appLinkIntro)}</td>
                </tr>
                <tr>
                  <td style="font-family:${SANS};font-size:13px;line-height:1.6;padding-bottom:26px;">
                    <a class="link" href="etto://app/verify?type=${verifyType}&amp;email={{ .Email }}&amp;token={{ .Token }}" style="color:#4f7458;">${sw(i18n.common.appLinkText)}</a>
                  </td>
                </tr>`;

const hr = (extra = '') =>
  `                <tr>
                  <td class="hr" style="border-top:1px solid #e4e8dd;font-size:0;line-height:0;${extra}">&nbsp;</td>
                </tr>`;

const footnote = (t) =>
  `                <tr>
                  <td class="faint" style="font-family:${SANS};font-size:13px;line-height:1.6;color:#8a9887;padding-top:20px;">
                    ${sw(t)}
                  </td>
                </tr>`;

const fromToWell = (t) => {
  const cellFaint = `font-family:${SANS};font-size:12px;letter-spacing:0.6px;text-transform:uppercase;color:#8a9887;padding-bottom:4px;`;
  const cellInk = `font-family:${SANS};font-size:15px;line-height:1.5;color:#2f3a32;`;
  return `                <tr>
                  <td class="well" style="background:#eef1e6;border-radius:12px;padding:16px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td class="faint" style="${cellFaint}">${sw(t.fromLabel)}</td></tr>
                      <tr><td class="ink" style="${cellInk}padding-bottom:12px;word-break:break-all;">{{ .Email }}</td></tr>
                      <tr><td class="faint" style="${cellFaint}">${sw(t.toLabel)}</td></tr>
                      <tr><td class="ink" style="${cellInk}word-break:break-all;">{{ .NewEmail }}</td></tr>
                    </table>
                  </td>
                </tr>`;
};

// --- page shell ------------------------------------------------------

function page(key, rows) {
  const t = i18n[key];
  return `<!DOCTYPE html>
<!-- GENERATED by scripts/build-email-templates.mjs from supabase/templates/i18n.json — do not edit by hand -->
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${sw(t.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${STYLE}
</style>
</head>
<body class="bg-ground" style="margin:0;padding:0;background:#f2f4ec;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${sw(t.preheader)}${SPACER}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-ground" style="background:#f2f4ec;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;">
${HEADER}
          <tr>
            <td class="card px py" style="background:#fbfcf7;border:1px solid #e4e8dd;border-radius:16px;padding:40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows.join('\n')}
              </table>
            </td>
          </tr>
${footer()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

// --- the six emails ------------------------------------------------------

const PAGES = {
  confirmation: () => {
    const t = i18n.confirmation;
    return page('confirmation', [
      heading(t.heading),
      body(t.body),
      button(t.button),
      codeWell(t.codeLabel),
      linkRows('padding:24px 0 6px;'),
      appLinkRow('signup'),
      hr(),
      footnote(t.footnote),
    ]);
  },

  invite: () => {
    const t = i18n.invite;
    return page('invite', [
      heading(t.heading),
      body(t.body),
      button(t.button),
      linkRows('padding-bottom:6px;'),
      hr(),
      footnote(t.footnote),
    ]);
  },

  magic_link: () => {
    const t = i18n.magic_link;
    return page('magic_link', [
      heading(t.heading),
      body(t.body),
      button(t.button),
      codeWell(t.codeLabel),
      linkRows('padding:24px 0 6px;'),
      appLinkRow('magiclink'),
      hr(),
      footnote(t.footnote),
    ]);
  },

  email_change: () => {
    const t = i18n.email_change;
    return page('email_change', [
      heading(t.heading),
      body(t.body, 20),
      fromToWell(t),
      button(t.button, 'padding:28px 0;'),
      codeWell(t.codeLabel),
      linkRows('padding:24px 0 6px;'),
      hr(),
      footnote(t.footnote),
    ]);
  },

  recovery: () => {
    const t = i18n.recovery;
    return page('recovery', [
      heading(t.heading),
      body(t.body),
      button(t.button),
      codeWell(t.codeLabel),
      linkRows('padding:24px 0 6px;'),
      appLinkRow('recovery'),
      hr(),
      footnote(t.footnote),
    ]);
  },

  reauthentication: () => {
    const t = i18n.reauthentication;
    return page('reauthentication', [
      heading(t.heading),
      body(t.body),
      codeWell(t.codeLabel, { pad: '22px 16px 24px', labelPb: 10, size: 32, ls: 8 }),
      hr('padding-top:28px;'),
      footnote(t.footnote),
    ]);
  },
};

// --- write templates ------------------------------------------------------

await mkdir(GEN_DIR, { recursive: true });
const KEYS = Object.keys(PAGES);
const subjects = {};

for (const key of KEYS) {
  const html = PAGES[key]();
  await writeFile(join(TPL_DIR, `${key}.html`), html);
  subjects[key] = sw(i18n[key].subject, { html: false });
  if (subjects[key].includes("'")) throw new Error(`subject for ${key} contains a straight apostrophe — breaks the TOML literal string`);
  console.log(`  supabase/templates/${key}.html  (${html.length} B)`);
}

await writeFile(join(GEN_DIR, 'subjects.json'), JSON.stringify(subjects, null, 2) + '\n');

// --- rewrite the marked block in config.toml ------------------------------

const BEGIN = '# >>> BEGIN generated email templates';
const END = '# <<< END generated email templates';
let cfg = await readFile(CONFIG, 'utf8');
const b = cfg.indexOf(BEGIN);
const e = cfg.indexOf(END);
if (b === -1 || e === -1 || e < b) throw new Error(`markers ${BEGIN} / ${END} not found in supabase/config.toml`);

const block = [
  BEGIN,
  ...KEYS.flatMap((key) => [
    `[auth.email.template.${key}]`,
    `subject = '${subjects[key]}'`,
    `content_path = './supabase/templates/${key}.html'`,
    '',
  ]).slice(0, -1),
  END,
].join('\n');

cfg = cfg.slice(0, b) + block + cfg.slice(e + END.length);
await writeFile(CONFIG, cfg);
console.log('  supabase/config.toml  (subjects block rewritten)');
console.log(`\n${KEYS.length} templates · ${i18n.locales.join(' / ')} · fallback ${FALLBACK}`);
