"""Rebuild prototype2.html as one self-contained SPA (run from plan/)."""
from pathlib import Path
import re

SRC = Path(__file__).with_name("prototype2.html")
OUT = SRC

text = SRC.read_text(encoding="utf-8")

# --- styles (first <style> block in outer head) ---
m_style = re.search(r"<style>\s*", text)
if not m_style:
    raise SystemExit("no <style>")
start = m_style.end()
end = text.find("</style>", start)
styles = text[start:end].strip()
# drop iframe wrapper hint
styles = styles.replace(
    "body {\n        background-color: white; /* Ensure the iframe has a white background */\n      }\n\n      ",
    "",
)

def extract_file_body(marker: str) -> str:
    i = text.find(marker)
    if i < 0:
        raise SystemExit(f"missing {marker}")
    body_open = text.find('<body class="bg-canvas', i)
    if body_open < 0:
        body_open = text.find("<body", i)
    if body_open < 0:
        raise SystemExit(f"no body for {marker}")
    body_open = text.find(">", body_open) + 1
    j = text.find("</body>", body_open)
    if j < 0:
        raise SystemExit(f"no </body> for {marker}")
    chunk = text[body_open:j]
    # drop per-page script blocks (logic lives in the bundled script)
    si = chunk.find("<script")
    if si >= 0:
        chunk = chunk[:si]
    # strip per-page modal/toast roots (shared at document level)
    chunk = re.sub(
        r'\s*<div id="modal-root"></div>\s*<div id="drawer-root"></div>\s*<div id="toast-root"></div>\s*',
        "\n",
        chunk,
    )
    chunk = re.sub(r'\s*<div id="toast-root"></div>\s*', "\n", chunk)
    return chunk.strip()

login_body = extract_file_body("<!-- FILE: login.html -->")
admin_body = extract_file_body("<!-- FILE: index.html -->")
student_body = extract_file_body("<!-- FILE: student-portal.html -->")

# --- main combined script ---
script_start = text.find('<script>\n      /* FILE: js/storage.js', text.find("student-portal.html"))
if script_start < 0:
    raise SystemExit("no main script")
script_start = text.find("<script>", script_start)
script_end = text.rfind("</script>")
main_script = text[script_start + len("<script>") : script_end].strip()

HEAD = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>USANT Library Management System · Prototype (single file)</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              maroon: {
                DEFAULT: "#7D1519",
                dark: "#2E080A",
                soft: "#9A2A2E",
              },
              gold: { DEFAULT: "#FAA61A", light: "#FFD25E" },
              warm: "#FAF7F1",
              canvas: "#F8F7F4",
              ink: "#221A18",
              muted: "#6B625F",
            },
            fontFamily: {
              serif: ['"Playfair Display"', "Georgia", "serif"],
              sans: ["Inter", "system-ui", "sans-serif"],
            },
          },
        },
      };
    </script>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-600-normal.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-700-normal.css"
    />
    <script src="https://cdn.jsdelivr.net/npm/lucide@0.454.0/dist/umd/lucide.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <style>
{styles}
      .screen-hidden {
        display: none !important;
      }
    </style>
  </head>
  <body class="bg-canvas font-sans text-ink">
    <h1 class="sr-only">USANT University Library Management System prototype</h1>
    <motion.div id="screen-login" class="screen-hidden" aria-live="polite"></motion.div>
"""

# fix accidental motion.div - use div
HEAD = HEAD.replace("<motion.div", "<div").replace("</motion.div>", "</div>")

BODY = f"""    <div id="screen-login" class="screen-hidden">
{login_body}
    </div>
    <div id="screen-admin" class="screen-hidden">
{admin_body}
    </div>
    <div id="screen-student" class="screen-hidden">
{student_body}
    </div>
    <div id="modal-root"></div>
    <div id="drawer-root"></div>
    <div id="toast-root"></div>
    <script>
{main_script}
    </script>
  </body>
</html>
"""

# fix HEAD - I duplicated screen-login wrongly in first HEAD draft
HEAD = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>USANT Library Management System · Prototype (single file)</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              maroon: {
                DEFAULT: "#7D1519",
                dark: "#2E080A",
                soft: "#9A2A2E",
              },
              gold: { DEFAULT: "#FAA61A", light: "#FFD25E" },
              warm: "#FAF7F1",
              canvas: "#F8F7F4",
              ink: "#221A18",
              muted: "#6B625F",
            },
            fontFamily: {
              serif: ['"Playfair Display"', "Georgia", "serif"],
              sans: ["Inter", "system-ui", "sans-serif"],
            },
          },
        },
      };
    </script>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-600-normal.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-700-normal.css"
    />
    <script src="https://cdn.jsdelivr.net/npm/lucide@0.454.0/dist/umd/lucide.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <style>
{styles}
      .screen-hidden {
        display: none !important;
      }
    </style>
  </head>
  <body class="bg-canvas font-sans text-ink">
"""

out = HEAD.replace("{styles}", styles) + BODY

# --- navigation + boot patches ---
replacements = [
    ("location.href =\n                Session.user().role === \"student\"\n                  ? \"student-portal.html\"\n                  : \"index.html\";", "Proto.goAfterLogin(Session.user());"),
    ("location.href =\n                      res.user.role === \"student\"\n                        ? \"student-portal.html\"\n                        : \"index.html\";", "Proto.goAfterLogin(res.user);"),
    (
        "location.href =\n              u.role === \"student\" ? \"student-portal.html\" : \"index.html\";",
        "Proto.goAfterLogin(u);",
    ),
    ("location.href = \"login.html\";", "Proto.screen(\"login\"); location.hash = \"\";"),
    ("location.replace(\"login.html\");", "Proto.screen(\"login\");"),
    ("location.replace(\"student-portal.html\");", "Proto.screen(\"student\");"),
    (
        '<a class="dropdown-item" href="student-portal.html">',
        "<a class=\"dropdown-item\" href=\"#\" onclick=\"Proto.screen('student');return false;\">",
    ),
    ("onclick: \"location.href='student-portal.html'\"", "onclick: \"Proto.screen('student')\""),
    ('al.href = "index.html";', "al.onclick = function (e) { e.preventDefault(); Proto.screen('admin'); };"),
]

for old, new in replacements:
    if old not in out:
        print("WARN: pattern not found:", old[:60], "...")
    out = out.replace(old, new)

proto_block = """
      /* Single-file screen router (prototype2.html) */
      const Proto = {
        screen: null,
        _loginReady: false,
        _adminReady: false,
        _studentReady: false,
        show(name) {
          const map = { login: "screen-login", admin: "screen-admin", student: "screen-student" };
          Object.keys(map).forEach((k) => {
            const el = document.getElementById(map[k]);
            if (el) el.classList.toggle("screen-hidden", k !== name);
          });
          document.body.dataset.app =
            name === "admin" ? "admin" : name === "student" ? "student" : "";
          this.screen = name;
        },
        goAfterLogin(user) {
          if (!user) {
            this.screen("login");
            return;
          }
          location.hash = "#/dashboard";
          if (user.role === "student") this.screen("student");
          else this.screen("admin");
        },
        screen(name) {
          this.show(name);
          if (name === "login") LoginPage.init();
          else if (name === "admin") {
            if (!this._adminReady) {
              this._adminReady = true;
              App.init();
            } else App.route(true);
          } else if (name === "student") {
            if (!this._studentReady) {
              this._studentReady = true;
              SP.init();
            } else SP.route();
          }
        },
        boot() {
          const s = Session.get();
          if (s && s.userId) {
            const u = Session.user();
            if (u && u.role === "student") this.screen("student");
            else this.screen("admin");
          } else this.screen("login");
        },
      };

      const LoginPage = {
        init() {
          if (LoginPage._bound) return;
          LoginPage._bound = true;
          lucide.createIcons();
          const demos = DB.get("users").filter((u) =>
            [
              "superadmin",
              "libadmin",
              "headlib",
              "librarian",
              "staff",
              "student",
            ].includes(u.role),
          );
          const roleIcon = {
            superadmin: "shield-check",
            libadmin: "shield",
            headlib: "user-check",
            librarian: "book-open",
            staff: "library",
            student: "graduation-cap",
          };
          document.getElementById("demo-accounts").innerHTML = demos
            .map(
              (u) =>
                '<button type="button" class="demo-btn" data-uid="' +
                u.id +
                '">' +
                '<span class="demo-ic"><i data-lucide="' +
                (roleIcon[u.role] || "user") +
                '" class="w-4 h-4"></i></span>' +
                '<span class="text-left"><span class="block text-sm font-semibold leading-tight">' +
                u.name +
                "</span>" +
                '<span class="block text-[11px] text-muted">' +
                (ROLES.find((r) => r.id === u.role) || {}).label +
                "</span></span></button>",
            )
            .join("");
          lucide.createIcons();
          document.querySelectorAll(".demo-btn").forEach((b) =>
            b.addEventListener("click", function () {
              Auth.demoLogin(this.dataset.uid);
            }),
          );
          document
            .getElementById("toggle-pw")
            .addEventListener("click", function () {
              const p = document.getElementById("password");
              p.type = p.type === "password" ? "text" : "password";
              this.innerHTML =
                '<i data-lucide="' +
                (p.type === "password" ? "eye" : "eye-off") +
                '" class="w-4 h-4"></i>';
              lucide.createIcons();
            });
          document
            .getElementById("forgot")
            .addEventListener("click", function () {
              UI.toast(
                "Password reset is simulated in this prototype. Use the demo password \\u201cusant123\\u201d.",
                "info",
              );
            });
          document
            .getElementById("login-form")
            .addEventListener("submit", function (e) {
              e.preventDefault();
              const email = document.getElementById("email").value.trim();
              const pw = document.getElementById("password").value;
              document.getElementById("email-err").textContent = "";
              document.getElementById("pw-err").textContent = "";
              let ok = true;
              if (!email) {
                document.getElementById("email-err").textContent =
                  "Email address is required";
                ok = false;
              }
              if (!pw) {
                document.getElementById("pw-err").textContent =
                  "Password is required";
                ok = false;
              }
              if (!ok) return;
              const btn = document.getElementById("sign-in-btn");
              btn.disabled = true;
              btn.innerHTML = '<span class="spinner"></span> Signing in\\u2026';
              setTimeout(function () {
                const res = Auth.login(email, pw);
                if (!res.ok) {
                  btn.disabled = false;
                  btn.innerHTML =
                    '<i data-lucide="log-in" class="w-4 h-4"></i> Sign in';
                  lucide.createIcons();
                  document.getElementById("pw-err").textContent = res.error;
                  UI.toast(res.error, "error");
                  return;
                }
                UI.toast(
                  "Welcome back, " +
                    res.user.name.split(" ").slice(-1)[0] +
                    "!",
                  "success",
                );
                setTimeout(function () {
                  Proto.goAfterLogin(res.user);
                }, 450);
              }, 600);
            });
        },
      };
"""

# Fix Proto object - I made a mistake with duplicate `screen` key. Let me fix proto_block in the script file before running.

proto_block = """
      /* Single-file screen router (prototype2.html) */
      const Proto = {
        active: null,
        _loginReady: false,
        _adminReady: false,
        _studentReady: false,
        _show(name) {
          const map = { login: "screen-login", admin: "screen-admin", student: "screen-student" };
          Object.keys(map).forEach((k) => {
            const el = document.getElementById(map[k]);
            if (el) el.classList.toggle("screen-hidden", k !== name);
          });
          document.body.dataset.app =
            name === "admin" ? "admin" : name === "student" ? "student" : "";
          this.active = name;
          if (name === "login") location.hash = "";
        },
        goAfterLogin(user) {
          if (!user) {
            this.screen("login");
            return;
          }
          location.hash = "#/dashboard";
          if (user.role === "student") this.screen("student");
          else this.screen("admin");
        },
        screen(name) {
          this._show(name);
          if (name === "login") LoginPage.init();
          else if (name === "admin") {
            if (!this._adminReady) {
              this._adminReady = true;
              App.init();
            } else App.route(true);
          } else if (name === "student") {
            if (!this._studentReady) {
              this._studentReady = true;
              SP.init();
            } else SP.route();
          }
        },
        boot() {
          const s = Session.get();
          if (s && s.userId) {
            const u = Session.user();
            if (u && u.role === "student") this.screen("student");
            else this.screen("admin");
          } else this.screen("login");
        },
      };

      const LoginPage = {
        _bound: false,
        init() {
          if (LoginPage._bound) return;
          LoginPage._bound = true;
          lucide.createIcons();
          const demos = DB.get("users").filter((u) =>
            [
              "superadmin",
              "libadmin",
              "headlib",
              "librarian",
              "staff",
              "student",
            ].includes(u.role),
          );
          const roleIcon = {
            superadmin: "shield-check",
            libadmin: "shield",
            headlib: "user-check",
            librarian: "book-open",
            staff: "library",
            student: "graduation-cap",
          };
          document.getElementById("demo-accounts").innerHTML = demos
            .map(
              (u) =>
                '<button type="button" class="demo-btn" data-uid="' +
                u.id +
                '">' +
                '<span class="demo-ic"><i data-lucide="' +
                (roleIcon[u.role] || "user") +
                '" class="w-4 h-4"></i></span>' +
                '<span class="text-left"><span class="block text-sm font-semibold leading-tight">' +
                u.name +
                "</span>" +
                '<span class="block text-[11px] text-muted">' +
                (ROLES.find((r) => r.id === u.role) || {}).label +
                "</span></span></button>",
            )
            .join("");
          lucide.createIcons();
          document.querySelectorAll(".demo-btn").forEach((b) =>
            b.addEventListener("click", function () {
              Auth.demoLogin(this.dataset.uid);
            }),
          );
          const togglePw = document.getElementById("toggle-pw");
          if (togglePw)
            togglePw.addEventListener("click", function () {
              const p = document.getElementById("password");
              p.type = p.type === "password" ? "text" : "password";
              this.innerHTML =
                '<i data-lucide="' +
                (p.type === "password" ? "eye" : "eye-off") +
                '" class="w-4 h-4"></i>';
              lucide.createIcons();
            });
          const forgot = document.getElementById("forgot");
          if (forgot)
            forgot.addEventListener("click", function () {
              UI.toast(
                "Password reset is simulated in this prototype. Use the demo password \\u201cusant123\\u201d.",
                "info",
              );
            });
          const form = document.getElementById("login-form");
          if (form)
            form.addEventListener("submit", function (e) {
              e.preventDefault();
              const email = document.getElementById("email").value.trim();
              const pw = document.getElementById("password").value;
              document.getElementById("email-err").textContent = "";
              document.getElementById("pw-err").textContent = "";
              let ok = true;
              if (!email) {
                document.getElementById("email-err").textContent =
                  "Email address is required";
                ok = false;
              }
              if (!pw) {
                document.getElementById("pw-err").textContent =
                  "Password is required";
                ok = false;
              }
              if (!ok) return;
              const btn = document.getElementById("sign-in-btn");
              btn.disabled = true;
              btn.innerHTML = '<span class="spinner"></span> Signing in\\u2026';
              setTimeout(function () {
                const res = Auth.login(email, pw);
                if (!res.ok) {
                  btn.disabled = false;
                  btn.innerHTML =
                    '<i data-lucide="log-in" class="w-4 h-4"></i> Sign in';
                  lucide.createIcons();
                  document.getElementById("pw-err").textContent = res.error;
                  UI.toast(res.error, "error");
                  return;
                }
                UI.toast(
                  "Welcome back, " +
                    res.user.name.split(" ").slice(-1)[0] +
                    "!",
                  "success",
                );
                setTimeout(function () {
                  Proto.goAfterLogin(res.user);
                }, 450);
              }, 600);
            });
        },
      };
"""

out = out.replace(
    "/* FILE: js/auth.js — simulated authentication & session */",
    proto_block + "\n      /* FILE: js/auth.js — simulated authentication & session */",
)

route_guard_admin = """route(force) {
          if (Proto.active !== "admin") return;
          if (!document.getElementById("app-shell")) return;"""
out = out.replace(
    """route(force) {
          if (!document.getElementById("app-shell")) return;""",
    route_guard_admin,
)

route_guard_sp = """route() {
          if (Proto.active !== "student") return;
          document.getElementById("sp-nav").classList.remove("open");"""
out = out.replace(
    """route() {
          document.getElementById("sp-nav").classList.remove("open");""",
    route_guard_sp,
)

boot = """
      document.addEventListener("DOMContentLoaded", function () {
        Proto.boot();
      });
"""
out = out.replace("    </script>\n  </body>", boot + "    </script>\n  </body>")

OUT.write_text(out, encoding="utf-8")
print(f"Wrote {OUT} ({len(out.splitlines())} lines)")