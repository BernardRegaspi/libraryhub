
/* FILE: js/storage.js — localStorage wrapper */
      const LS_PREFIX = "usant_lms_";
      const Store = {
        get(k, fallback) {
          try {
            const v = localStorage.getItem(LS_PREFIX + k);
            return v === null
              ? fallback === undefined
                ? null
                : fallback
              : JSON.parse(v);
          } catch (e) {
            return fallback === undefined ? null : fallback;
          }
        },
        set(k, val) {
          try {
            localStorage.setItem(LS_PREFIX + k, JSON.stringify(val));
          } catch (e) {
            console.warn("storage set failed", e);
          }
        },
        del(k) {
          localStorage.removeItem(LS_PREFIX + k);
        },
        clearAll() {
          Object.keys(localStorage)
            .filter((k) => k.startsWith(LS_PREFIX))
            .forEach((k) => localStorage.removeItem(k));
        },
      };

      /* FILE: js/data.js — seed data, DB access, helpers (all fictional sample data) */
      const SEED_VER = "v1.4";
      const TODAY =
        "2026-11-15"; /* prototype "today" anchor used by seed data */

      const DEPARTMENTS = [
        {
          id: "college",
          name: "College Library",
          short: "College",
          head: "Ms. Liza Fernandez",
          floor: "Main Library · 1st–3rd Floor",
          color: "#7D1519",
        },
        {
          id: "graduate",
          name: "Graduate School Library",
          short: "Graduate",
          head: "Dr. Ramon Delgado",
          floor: "Main Library · 4th Floor",
          color: "#2E080A",
        },
        {
          id: "shs",
          name: "Senior High School Library",
          short: "Senior High",
          head: "Mr. Juanito Reyes",
          floor: "SHS Building · Ground Floor",
          color: "#8A5A00",
        },
        {
          id: "jhs",
          name: "Junior High School Library",
          short: "Junior High",
          head: "Ms. Rowena Ignacio",
          floor: "JHS Building · 2nd Floor",
          color: "#274E37",
        },
        {
          id: "gs",
          name: "Grade School Library",
          short: "Grade School",
          head: "Ms. Tessie Bernal",
          floor: "Grade School Bldg · 1st Floor",
          color: "#1F3A5F",
        },
      ];
      const ROLES = [
        { id: "superadmin", label: "Super Administrator", level: 5 },
        { id: "libadmin", label: "Library Administrator", level: 4 },
        { id: "headlib", label: "Head Librarian", level: 3 },
        { id: "librarian", label: "Librarian", level: 2 },
        { id: "staff", label: "Library Staff", level: 1 },
        { id: "student", label: "Student / Patron", level: 0 },
      ];

      /* ---------- helpers ---------- */
      function todayStr() {
        const d = new Date();
        return d.toISOString().slice(0, 10);
      }
      function nowStr() {
        const d = new Date();
        return d.toISOString().slice(0, 16).replace("T", " ");
      }
      function dateAdd(iso, days) {
        const d = new Date(iso + "T00:00:00");
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
      }
      function fmtDate(iso) {
        if (!iso) return "—";
        const d = new Date(iso + "T00:00:00");
        return d.toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
      function fmtDateLong(iso) {
        const d = new Date((iso || todayStr()) + "T00:00:00");
        return d.toLocaleDateString("en-PH", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      }
      function money(n) {
        return (
          "\u20B1" +
          Number(n || 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
      }
      function daysLate(due, end) {
        if (!due) return 0;
        const ms =
          new Date((end || todayStr()) + "T00:00:00") -
          new Date(due + "T00:00:00");
        return Math.max(0, Math.floor(ms / 86400000));
      }
      function uid(prefix) {
        return (
          prefix +
          "-" +
          Date.now().toString(36).toUpperCase() +
          Math.floor(Math.random() * 900 + 100)
        );
      }
      function esc(s) {
        return String(s == null ? "" : s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      function trunc(s, n) {
        s = String(s || "");
        return s.length > n ? s.slice(0, n - 1) + "…" : s;
      }
      function initials(name) {
        return String(name || "?")
          .replace(/(Dr\.|Ms\.|Mr\.|Prof\.)\s*/g, "")
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
          .toUpperCase();
      }
      function timeAgo(ts) {
        const ms = Date.now() - new Date(ts.replace(" ", "T")).getTime();
        const m = Math.floor(ms / 60000);
        if (m < 1) return "just now";
        if (m < 60) return m + "m ago";
        const h = Math.floor(m / 60);
        if (h < 24) return h + "h ago";
        return Math.floor(h / 24) + "d ago";
      }

      /* ---------- seed tuples ---------- */
      const _B = [
        /* id,title,author,publisher,year,isbn,subject,callNo,dewey,dept,copies,shelf,popularity */
        [
          "BK-1001",
          "Noli Me Tangere",
          "Jose Rizal",
          "National Historical Institute",
          2007,
          "978-971-538-102-4",
          "Philippine Literature",
          "F 2601 R628",
          "899.211",
          "college",
          4,
          "FIC-RIZ-01",
          38,
        ],
        [
          "BK-1002",
          "El Filibusterismo",
          "Jose Rizal",
          "National Historical Institute",
          2008,
          "978-971-538-114-7",
          "Philippine Literature",
          "F 2602 R628",
          "899.211",
          "college",
          3,
          "FIC-RIZ-02",
          31,
        ],
        [
          "BK-1003",
          "Fundamentals of Nursing",
          "Kozier & Erb",
          "Pearson",
          2021,
          "978-0-13-532169-0",
          "Nursing",
          "610.73 KOZ",
          "610.73",
          "college",
          5,
          "REF-NUR-01",
          44,
        ],
        [
          "BK-1004",
          "Medical-Surgical Nursing: Concepts and Practice",
          "Lewis, Bucher et al.",
          "Elsevier",
          2020,
          "978-0-323-60914-6",
          "Nursing",
          "610.73 LEW",
          "610.73",
          "college",
          4,
          "NUR-02",
          35,
        ],
        [
          "BK-1005",
          "Human Anatomy & Physiology",
          "Marieb & Hoehn",
          "Pearson",
          2019,
          "978-0-13-458099-9",
          "Biology",
          "612 MAR",
          "612",
          "college",
          4,
          "SCI-ANA-01",
          41,
        ],
        [
          "BK-1006",
          "Introduction to Algorithms",
          "Cormen, Leiserson, Rivest, Stein",
          "MIT Press",
          2022,
          "978-0-262-04630-5",
          "Computer Science",
          "005.1 COR",
          "005.1",
          "college",
          2,
          "IT-ALG-01",
          36,
        ],
        [
          "BK-1007",
          "Clean Code",
          "Robert C. Martin",
          "Prentice Hall",
          2008,
          "978-0-13-235088-4",
          "Software Engineering",
          "005.12 MAR",
          "005.12",
          "college",
          2,
          "IT-SE-01",
          27,
        ],
        [
          "BK-1008",
          "The Pragmatic Programmer",
          "Hunt & Thomas",
          "Addison-Wesley",
          2019,
          "978-0-13-595705-9",
          "Software Engineering",
          "005.1 HUN",
          "005.1",
          "college",
          2,
          "IT-SE-02",
          24,
        ],
        [
          "BK-1009",
          "Psychology: Themes and Variations",
          "Wayne Weiten",
          "Cengage",
          2020,
          "978-1-133-95616-7",
          "Psychology",
          "150 WEE",
          "150",
          "college",
          3,
          "PSY-GEN-01",
          19,
        ],
        [
          "BK-1010",
          "Intermediate Accounting",
          "Weygandt, Kimmel, Kieso",
          "Wiley",
          2021,
          "978-1-119-72054-7",
          "Accountancy",
          "657 WEY",
          "657",
          "college",
          3,
          "BUS-ACC-01",
          22,
        ],
        [
          "BK-1011",
          "Principles of Marketing",
          "Philip Kotler",
          "Pearson",
          2021,
          "978-1-292-40853-8",
          "Business",
          "658.8 KOT",
          "658.8",
          "college",
          3,
          "BUS-MKT-01",
          25,
        ],
        [
          "BK-1012",
          "Elementary Statistics",
          "Mario F. Triola",
          "Pearson",
          2018,
          "978-0-13-446218-9",
          "Mathematics",
          "519.5 TRI",
          "519.5",
          "college",
          3,
          "SCI-STA-01",
          21,
        ],
        [
          "BK-1013",
          "The Philippines: A Past Revisited",
          "Renato Constantino",
          "Tala Publishing",
          1975,
          "978-0-916-69510-1",
          "Philippine History",
          "959.9 CON",
          "959.9",
          "college",
          2,
          "FIL-HIS-01",
          17,
        ],
        [
          "BK-1014",
          "Calculus: Early Transcendentals",
          "James Stewart",
          "Cengage",
          2020,
          "978-0-538-49790-9",
          "Mathematics",
          "515 STE",
          "515",
          "college",
          3,
          "SCI-CAL-01",
          20,
        ],
        [
          "BK-1015",
          "Introduction to Criminology",
          "Curt R. Bartol",
          "Pearson",
          2019,
          "978-0-13-454578-3",
          "Criminology",
          "364 BAR",
          "364",
          "college",
          2,
          "CRI-GEN-01",
          15,
        ],
        [
          "BK-1016",
          "Facilitating Learning: Principles of Teaching",
          "Asuncion M. David",
          "Rex Book Store",
          2019,
          "978-971-23-8812-5",
          "Education",
          "371.1 DAV",
          "371.1",
          "college",
          3,
          "EDU-TCH-01",
          12,
        ],
        [
          "BK-1017",
          "Research Design: Qualitative, Quantitative, and Mixed Methods",
          "John W. Creswell",
          "SAGE Publications",
          2018,
          "978-1-5063-8670-6",
          "Research Methods",
          "001.42 CRE",
          "001.42",
          "graduate",
          3,
          "GR-RES-01",
          29,
        ],
        [
          "BK-1018",
          "Educational Leadership and Management",
          "Ma. Teresita Gutierrez",
          "Rex Book Store",
          2020,
          "978-971-23-9104-0",
          "Education Administration",
          "371.2 GUT",
          "371.2",
          "graduate",
          2,
          "GR-EDU-01",
          14,
        ],
        [
          "BK-1019",
          "Applied Statistics for Research",
          "Susan Nolan, Thomas Heinzen",
          "Worth Publishers",
          2017,
          "978-1-4641-9204-3",
          "Statistics",
          "519.5 NOL",
          "519.5",
          "graduate",
          2,
          "GR-STA-01",
          11,
        ],
        [
          "BK-1020",
          "Nursing Research: Generating and Appraising Evidence",
          "Denise Polit, Cheryl Beck",
          "Wolters Kluwer",
          2021,
          "978-1-9751-4006-9",
          "Nursing Research",
          "610.73072 POL",
          "610.73",
          "graduate",
          2,
          "GR-NUR-01",
          16,
        ],
        [
          "BK-1021",
          "The Practice of Management",
          "Peter F. Drucker",
          "HarperBusiness",
          2006,
          "978-0-06-087898-6",
          "Management",
          "658 DRU",
          "658",
          "graduate",
          2,
          "GR-MGT-01",
          13,
        ],
        [
          "BK-1022",
          "Qualitative Research Methods",
          "David Silverman",
          "SAGE Publications",
          2021,
          "978-1-5297-6847-3",
          "Research Methods",
          "001.42 SIL",
          "001.42",
          "graduate",
          2,
          "GR-RES-02",
          9,
        ],
        [
          "BK-1023",
          "General Biology 1",
          "Nieves F. Lacuna",
          "Rex Book Store",
          2017,
          "978-971-23-8211-6",
          "Science",
          "570 GEN",
          "570",
          "shs",
          4,
          "SHS-SCI-01",
          10,
        ],
        [
          "BK-1024",
          "Oral Communication in Context",
          "Grace D. Jimenez",
          "Rex Book Store",
          2016,
          "978-971-23-7955-0",
          "Communication",
          "808.5 JIM",
          "808.5",
          "shs",
          4,
          "SHS-COM-01",
          8,
        ],
        [
          "BK-1025",
          "General Mathematics",
          "Melvin M. Nivera",
          "Salesiana Books",
          2016,
          "978-971-23-8017-4",
          "Mathematics",
          "510 GEN",
          "510",
          "shs",
          5,
          "SHS-MATH-01",
          9,
        ],
        [
          "BK-1026",
          "Earth and Life Science",
          "Maria A. Alzona",
          "Phoenix Publishing",
          2017,
          "978-971-669-812-1",
          "Science",
          "550 EARTH",
          "550",
          "shs",
          4,
          "SHS-SCI-02",
          7,
        ],
        [
          "BK-1027",
          "21st Century Literature from the Philippines and the World",
          "Josefina R. Ilagan",
          "Rex Book Store",
          2016,
          "978-971-23-8120-1",
          "Literature",
          "899.211 ILL",
          "899.21",
          "shs",
          3,
          "SHS-LIT-01",
          6,
        ],
        [
          "BK-1028",
          "Introduction to the Philosophy of the Human Person",
          "Rafael B. Bernal",
          "Phoenix Publishing",
          2016,
          "978-971-669-771-1",
          "Philosophy",
          "128.2 BER",
          "128",
          "shs",
          3,
          "SHS-PHI-01",
          5,
        ],
        [
          "BK-1029",
          "Integrated Science 7",
          "Teresita C. Padilla",
          "Diwa Learning Systems",
          2016,
          "978-971-537-220-6",
          "Science",
          "500 SCI7",
          "500",
          "jhs",
          5,
          "JHS-SCI-01",
          6,
        ],
        [
          "BK-1030",
          "Mathematics 8: Patterns and Practicalities",
          "Melvin M. Nivera",
          "Salesiana Books",
          2015,
          "978-971-9553-11-2",
          "Mathematics",
          "510 NIV8",
          "510",
          "jhs",
          5,
          "JHS-MATH-01",
          5,
        ],
        [
          "BK-1031",
          "Filipino 9: Panitikang Panlipunan",
          "Rex Teaching Staff",
          "Rex Book Store",
          2015,
          "978-971-23-7600-9",
          "Filipino",
          "499.211 FIL9",
          "499.21",
          "jhs",
          4,
          "JHS-FIL-01",
          4,
        ],
        [
          "BK-1032",
          "Araling Panlipunan 10: Kontemporaryong Isyu",
          "Aileen M. Aguado",
          "Phoenix Publishing",
          2016,
          "978-971-669-611-0",
          "Social Studies",
          "959.9 ARA10",
          "959.9",
          "jhs",
          4,
          "JHS-AP-01",
          4,
        ],
        [
          "BK-1033",
          "Mga Kuwento ni Lola Basyang",
          "Severino Reyes",
          "Anvil Publishing",
          2018,
          "978-971-27-9101-7",
          "Filipino Stories",
          "899.211 REY",
          "899.21",
          "gs",
          3,
          "GS-FIC-01",
          8,
        ],
        [
          "BK-1034",
          "Science Adventures 5",
          "Lorna B. Mendoza",
          "Plaridel Publishing",
          2017,
          "978-971-504-220-8",
          "Science",
          "500 SCI5",
          "500",
          "gs",
          3,
          "GS-SCI-01",
          5,
        ],
        [
          "BK-1035",
          "Mathematics 4: Numbers and Patterns",
          "Jose Mari L. Cruz",
          "Rex Book Store",
          2016,
          "978-971-23-7800-3",
          "Mathematics",
          "510 CRU4",
          "510",
          "gs",
          4,
          "GS-MATH-01",
          6,
        ],
        [
          "BK-1036",
          "A Field Guide to Philippine Plants for Young Explorers",
          "Cecilia P. Torres",
          "Anvil Publishing",
          2019,
          "978-971-27-8811-6",
          "Nature",
          "581.959 TOR",
          "581.95",
          "gs",
          2,
          "GS-NAT-01",
          2,
        ],
      ];
      const _P = [
        /* id,type,no,name,email,program,year,dept,phone,joined,status */
        [
          "P-1001",
          "student",
          "2022-00438",
          "Maria Clara Bautista",
          "mcbautista@student.usant.edu.ph",
          "BS Nursing",
          "3rd Year",
          "college",
          "0917-555-0142",
          "2022-06-15",
          "active",
        ],
        [
          "P-1002",
          "student",
          "2021-01257",
          "Jose Miguel Ramirez",
          "jmramirez@student.usant.edu.ph",
          "BS Information Technology",
          "4th Year",
          "college",
          "0918-555-0177",
          "2021-06-14",
          "active",
        ],
        [
          "P-1003",
          "student",
          "2023-00921",
          "Angela Nicole Pascual",
          "anpascual@student.usant.edu.ph",
          "BS Education",
          "2nd Year",
          "college",
          "0927-555-0103",
          "2023-08-01",
          "active",
        ],
        [
          "P-1004",
          "student",
          "2022-00774",
          "Karl Vincent Ocampo",
          "kvocampo@student.usant.edu.ph",
          "BS Criminology",
          "3rd Year",
          "college",
          "0935-555-0166",
          "2022-06-15",
          "active",
        ],
        [
          "P-1005",
          "student",
          "2024-00115",
          "Samantha Louise Dela Cruz",
          "sldelacruz@student.usant.edu.ph",
          "BS Business Administration",
          "1st Year",
          "college",
          "0995-555-0121",
          "2024-08-05",
          "active",
        ],
        [
          "P-1006",
          "student",
          "2021-01402",
          "Raffy Mendoza Tuazon",
          "rmtuazon@student.usant.edu.ph",
          "BS Psychology",
          "4th Year",
          "college",
          "0906-555-0190",
          "2021-06-14",
          "suspended",
        ],
        [
          "P-1007",
          "student",
          "2023-00566",
          "Christine Joy Alcantara",
          "cjalcantara@student.usant.edu.ph",
          "BS Nursing",
          "2nd Year",
          "college",
          "0945-555-0158",
          "2023-08-01",
          "active",
        ],
        [
          "P-1008",
          "student",
          "2022-00890",
          "Miguel Antonio Garcia",
          "magarcia@student.usant.edu.ph",
          "BS Information Technology",
          "3rd Year",
          "college",
          "0916-555-0134",
          "2022-06-15",
          "active",
        ],
        [
          "P-1009",
          "student",
          "2024-00233",
          "Patricia Mae Villanueva",
          "pmvillanueva@student.usant.edu.ph",
          "BS Education",
          "1st Year",
          "college",
          "0975-555-0149",
          "2024-08-05",
          "active",
        ],
        [
          "P-1010",
          "student",
          "2021-01188",
          "John Rey Castillo",
          "jrcastillo@student.usant.edu.ph",
          "BS Criminology",
          "4th Year",
          "college",
          "0928-555-0112",
          "2021-06-14",
          "active",
        ],
        [
          "P-1011",
          "faculty",
          "T-0087",
          "Dr. Elena Mercado-Santos",
          "elena.mercado@usant.edu.ph",
          "College of Nursing",
          "Faculty",
          "college",
          "0917-555-0201",
          "2019-07-01",
          "active",
        ],
        [
          "P-1012",
          "faculty",
          "T-0112",
          "Prof. Ricardo Nabua",
          "ricardo.nabua@usant.edu.ph",
          "College of Education",
          "Faculty",
          "college",
          "0918-555-0233",
          "2020-01-15",
          "active",
        ],
        [
          "P-1013",
          "staff",
          "E-0034",
          "Ms. Divina Gracia Torres",
          "divina.torres@usant.edu.ph",
          "Registrar Office",
          "Staff",
          "college",
          "0926-555-0288",
          "2018-06-01",
          "active",
        ],
        [
          "P-1101",
          "student",
          "2024-G-0012",
          "Carmela Reyes-Domingo",
          "c.reyesdomingo@grad.usant.edu.ph",
          "MA in Education",
          "2nd Year",
          "graduate",
          "0917-666-0143",
          "2024-07-08",
          "active",
        ],
        [
          "P-1102",
          "student",
          "2023-G-0048",
          "Ernesto Bagumbayan Lahite",
          "e.lahite@grad.usant.edu.ph",
          "MA in Nursing",
          "3rd Year",
          "graduate",
          "0918-666-0176",
          "2023-07-10",
          "active",
        ],
        [
          "P-1103",
          "student",
          "2025-G-0007",
          "Grace Amihan Villar",
          "g.villar@grad.usant.edu.ph",
          "PhD in Education",
          "1st Year",
          "graduate",
          "0927-666-0159",
          "2025-07-07",
          "active",
        ],
        [
          "P-1104",
          "faculty",
          "T-0201",
          "Dr. Perpetua Dela Vega",
          "perpetua.delavega@usant.edu.ph",
          "Graduate School",
          "Faculty",
          "graduate",
          "0935-666-0121",
          "2017-06-01",
          "active",
        ],
        [
          "P-1301",
          "student",
          "2025-S-0143",
          "Kyla Andrea Panganiban",
          "ka.panganiban@shs.usant.edu.ph",
          "Grade 12 – STEM",
          "Grade 12",
          "shs",
          "0945-777-0111",
          "2025-08-11",
          "active",
        ],
        [
          "P-1302",
          "student",
          "2025-S-0208",
          "Jomari Francisco Baltazar",
          "jf.baltazar@shs.usant.edu.ph",
          "Grade 12 – ABM",
          "Grade 12",
          "shs",
          "0916-777-0128",
          "2025-08-11",
          "active",
        ],
        [
          "P-1303",
          "student",
          "2026-S-0077",
          "Danica Louise Romero",
          "dl.romero@shs.usant.edu.ph",
          "Grade 11 – HUMSS",
          "Grade 11",
          "shs",
          "0995-777-0167",
          "2026-08-10",
          "active",
        ],
        [
          "P-1304",
          "student",
          "2026-S-0110",
          "Aljon Matthew Sison",
          "am.sison@shs.usant.edu.ph",
          "Grade 11 – GAS",
          "Grade 11",
          "shs",
          "0975-777-0184",
          "2026-08-10",
          "active",
        ],
        [
          "P-1401",
          "student",
          "2024-J-0055",
          "Zoe Gabrielle Lim",
          "zg.lim@jhs.usant.edu.ph",
          "Grade 9 – Sampaguita",
          "Grade 9",
          "jhs",
          "0906-888-0122",
          "2024-08-12",
          "active",
        ],
        [
          "P-1402",
          "student",
          "2023-J-0102",
          "Nathan Cruz Delgado",
          "nc.delgado@jhs.usant.edu.ph",
          "Grade 10 – Rizal",
          "Grade 10",
          "jhs",
          "0928-888-0139",
          "2023-08-14",
          "active",
        ],
        [
          "P-1403",
          "student",
          "2025-J-0031",
          "Ysabel Andrea Manalo",
          "ya.manalo@jhs.usant.edu.ph",
          "Grade 8 – Mabini",
          "Grade 8",
          "jhs",
          "0939-888-0175",
          "2025-08-11",
          "active",
        ],
        [
          "P-1501",
          "student",
          "2023-E-0044",
          "Luis Miguel Borja",
          "lm.borja@gs.usant.edu.ph",
          "Grade 5 – St. Anthony",
          "Grade 5",
          "gs",
          "0947-999-0105",
          "2023-08-15",
          "active",
        ],
        [
          "P-1502",
          "student",
          "2024-E-0090",
          "Sofia Camille Aguirre",
          "sc.aguirre@gs.usant.edu.ph",
          "Grade 6 – St. Claire",
          "Grade 6",
          "gs",
          "0956-999-0143",
          "2024-08-13",
          "active",
        ],
      ];
      const _L = [
        /* id,bookId,patronId,checkout,due,returned,status,renewals,fineAssessed */
        [
          "LN-2401",
          "BK-1006",
          "P-1002",
          "2026-11-10",
          "2026-11-17",
          null,
          "active",
          0,
        ],
        [
          "LN-2402",
          "BK-1003",
          "P-1001",
          "2026-11-12",
          "2026-11-19",
          null,
          "active",
          0,
        ],
        [
          "LN-2403",
          "BK-1010",
          "P-1004",
          "2026-11-08",
          "2026-11-15",
          null,
          "active",
          1,
        ],
        [
          "LN-2404",
          "BK-1017",
          "P-1101",
          "2026-11-09",
          "2026-11-23",
          null,
          "active",
          0,
        ],
        [
          "LN-2405",
          "BK-1023",
          "P-1301",
          "2026-11-11",
          "2026-11-18",
          null,
          "active",
          0,
        ],
        [
          "LN-2406",
          "BK-1029",
          "P-1401",
          "2026-11-13",
          "2026-11-20",
          null,
          "active",
          0,
        ],
        [
          "LN-2407",
          "BK-1033",
          "P-1501",
          "2026-11-15",
          "2026-11-22",
          null,
          "active",
          0,
        ],
        [
          "LN-2408",
          "BK-1011",
          "P-1005",
          "2026-11-15",
          "2026-11-22",
          null,
          "active",
          0,
        ],
        [
          "LN-2409",
          "BK-1001",
          "P-1003",
          "2026-10-25",
          "2026-11-01",
          null,
          "overdue",
          0,
        ],
        [
          "LN-2410",
          "BK-1008",
          "P-1006",
          "2026-10-20",
          "2026-10-27",
          null,
          "overdue",
          0,
        ],
        [
          "LN-2411",
          "BK-1012",
          "P-1009",
          "2026-10-28",
          "2026-11-04",
          null,
          "overdue",
          0,
        ],
        [
          "LN-2412",
          "BK-1020",
          "P-1102",
          "2026-10-30",
          "2026-11-13",
          null,
          "overdue",
          0,
        ],
        [
          "LN-2413",
          "BK-1005",
          "P-1007",
          "2026-10-10",
          "2026-10-17",
          "2026-10-16",
          "returned",
          0,
        ],
        [
          "LN-2414",
          "BK-1002",
          "P-1008",
          "2026-10-12",
          "2026-10-19",
          "2026-10-22",
          "returned",
          0,
          6,
        ],
        [
          "LN-2415",
          "BK-1014",
          "P-1002",
          "2026-10-15",
          "2026-10-22",
          "2026-10-21",
          "returned",
          1,
        ],
        [
          "LN-2416",
          "BK-1009",
          "P-1010",
          "2026-10-18",
          "2026-10-25",
          "2026-10-25",
          "returned",
          0,
        ],
        [
          "LN-2417",
          "BK-1013",
          "P-1011",
          "2026-10-01",
          "2026-10-15",
          "2026-10-14",
          "returned",
          0,
        ],
        [
          "LN-2418",
          "BK-1018",
          "P-1103",
          "2026-10-20",
          "2026-11-03",
          "2026-11-05",
          "returned",
          0,
          4,
        ],
        [
          "LN-2419",
          "BK-1024",
          "P-1302",
          "2026-10-22",
          "2026-10-29",
          "2026-10-28",
          "returned",
          0,
        ],
        [
          "LN-2420",
          "BK-1030",
          "P-1402",
          "2026-11-01",
          "2026-11-08",
          "2026-11-07",
          "returned",
          0,
        ],
        [
          "LN-2421",
          "BK-1034",
          "P-1502",
          "2026-11-05",
          "2026-11-12",
          "2026-11-15",
          "returned",
          0,
        ],
        [
          "LN-2422",
          "BK-1007",
          "P-1001",
          "2026-10-28",
          "2026-11-04",
          "2026-11-03",
          "returned",
          0,
        ],
        [
          "LN-2423",
          "BK-1021",
          "P-1104",
          "2026-10-10",
          "2026-10-24",
          "2026-10-30",
          "returned",
          0,
          12,
        ],
        [
          "LN-2424",
          "BK-1031",
          "P-1403",
          "2026-11-02",
          "2026-11-09",
          "2026-11-10",
          "returned",
          0,
          2,
        ],
      ];
      const _R = [
        /* id,bookId,patronId,date,status,note */
        ["RSV-0501", "BK-1001", "P-1002", "2026-11-13", "pending", ""],
        ["RSV-0502", "BK-1001", "P-1008", "2026-11-14", "pending", ""],
        [
          "RSV-0503",
          "BK-1003",
          "P-1007",
          "2026-11-12",
          "ready",
          "Held at College circulation desk",
        ],
        [
          "RSV-0504",
          "BK-1006",
          "P-1008",
          "2026-11-10",
          "ready",
          "Held at College circulation desk",
        ],
        ["RSV-0505", "BK-1017", "P-1103", "2026-11-08", "pending", ""],
        ["RSV-0506", "BK-1023", "P-1303", "2026-11-11", "pending", ""],
        ["RSV-0507", "BK-1005", "P-1001", "2026-11-05", "collected", ""],
        [
          "RSV-0508",
          "BK-1011",
          "P-1009",
          "2026-10-20",
          "expired",
          "Not picked up within hold period",
        ],
        ["RSV-0509", "BK-1029", "P-1402", "2026-11-02", "collected", ""],
        ["RSV-0510", "BK-1002", "P-1004", "2026-11-14", "pending", ""],
        ["RSV-0511", "BK-1033", "P-1502", "2026-11-13", "approved", ""],
        [
          "RSV-0512",
          "BK-1008",
          "P-1005",
          "2026-10-28",
          "cancelled",
          "Patron found alternative copy",
        ],
      ];
      const _U = [
        /* id,name,email,role,dept,phone,patronId */
        [
          "U-0001",
          "Dr. Ramon Delgado",
          "admin@library.usant.edu.ph",
          "superadmin",
          "all",
          "0917-200-0001",
          "",
        ],
        [
          "U-0002",
          "Ms. Corazon Villareal",
          "corazon.villareal@usant.edu.ph",
          "libadmin",
          "all",
          "0917-200-0002",
          "",
        ],
        [
          "U-0003",
          "Mr. Eduardo Santos",
          "eduardo.santos@usant.edu.ph",
          "headlib",
          "college",
          "0917-200-0003",
          "",
        ],
        [
          "U-0004",
          "Ms. Liza Fernandez",
          "liza.fernandez@usant.edu.ph",
          "librarian",
          "college",
          "0917-200-0004",
          "",
        ],
        [
          "U-0005",
          "Mr. Juanito Reyes",
          "juanito.reyes@usant.edu.ph",
          "staff",
          "shs",
          "0917-200-0005",
          "",
        ],
        [
          "U-0006",
          "Maria Clara Bautista",
          "mcbautista@student.usant.edu.ph",
          "student",
          "college",
          "0917-555-0142",
          "P-1001",
        ],
        [
          "U-0007",
          "Jose Miguel Ramirez",
          "jmramirez@student.usant.edu.ph",
          "student",
          "college",
          "0918-555-0177",
          "P-1002",
        ],
      ];

      function _lcg(seed) {
        let s = seed;
        return function () {
          s = (s * 1103515245 + 12345) % 2147483648;
          return s / 2147483648;
        };
      }

      const SEED = {
        settings: {
          finePerDay: 2,
          loanDaysStudent: 7,
          loanDaysFaculty: 14,
          maxRenewals: 2,
          maxBooksStudent: 3,
          maxBooksFaculty: 5,
          holdDays: 3,
        },
        prefs: {
          perPage: 10,
          density: "comfortable",
          defaultDept: "college",
          emailNotifs: true,
          browserNotifs: false,
          autoOverdueNotices: true,
        },
        departments: DEPARTMENTS,
        roles: ROLES,
        books: _B.map((r, i) => ({
          id: r[0],
          title: r[1],
          author: r[2],
          publisher: r[3],
          year: r[4],
          isbn: r[5],
          subject: r[6],
          callNo: r[7],
          dewey: r[8],
          dept: r[9],
          copies: r[10],
          shelf: r[11],
          popularity: r[12],
          status: "catalogued",
          edition: i % 7 === 0 ? "2nd" : "1st",
          available: r[10],
          dateAdded:
            i >= 32
              ? "2026-11-" + String(2 + (i - 32) * 3).padStart(2, "0")
              : "2024-06-1" + (i % 9),
          source: "prototype-local",
        })),
        patrons: _P.map((r) => ({
          id: r[0],
          type: r[1],
          no: r[2],
          name: r[3],
          email: r[4],
          program: r[5],
          year: r[6],
          dept: r[7],
          phone: r[8],
          joined: r[9],
          status: r[10],
          portalAccess: true,
        })),
        users: _U.map((r) => ({
          id: r[0],
          name: r[1],
          email: r[2],
          role: r[3],
          dept: r[4],
          phone: r[5],
          patronId: r[6],
          status: "active",
          password: "usant123",
          created: "2023-01-10",
          lastLogin:
            r[0] === "U-0004"
              ? "2026-11-15 07:58"
              : "2026-11-14 16:2" + r[0].slice(-1),
        })),
        payments: [
          {
            id: "PAY-0001",
            ref: "LN-2414",
            amount: 6,
            date: "2026-10-24",
            method: "Cash",
            or: "OR-10231",
            cashier: "Juanito Reyes",
          },
          {
            id: "PAY-0002",
            ref: "LN-2418",
            amount: 4,
            date: "2026-11-06",
            method: "GCash",
            or: "OR-10232",
            cashier: "Liza Fernandez",
          },
          {
            id: "PAY-0003",
            ref: "LN-2423",
            amount: 12,
            date: "2026-11-02",
            method: "Cash",
            or: "OR-10233",
            cashier: "Juanito Reyes",
          },
          {
            id: "PAY-0004",
            ref: "LN-2424",
            amount: 2,
            date: "2026-11-12",
            method: "Cash",
            or: "OR-10234",
            cashier: "Liza Fernandez",
          },
        ],
        fines: [
          {
            id: "FIN-0301",
            type: "lost",
            patronId: "P-1010",
            bookId: "BK-1015",
            amount: 850,
            date: "2026-11-08",
            note: "Reported lost — replacement cost + ₱50 processing fee",
          },
          {
            id: "FIN-0302",
            type: "damaged",
            patronId: "P-1302",
            bookId: "BK-1024",
            amount: 150,
            date: "2026-11-01",
            note: "Water damage on pp. 40–55, assessed repair fee",
          },
        ],
        requests: [
          {
            id: "PR-0201",
            title: "Sa Aking Kababayan: Selected Poems of Rizal",
            requester: "Prof. Ricardo Nabua",
            dept: "college",
            qty: 2,
            estCost: 1400,
            date: "2026-11-10",
            status: "pending",
            priority: "high",
            note: "Requested for Rizal Day exhibit",
          },
          {
            id: "PR-0202",
            title: "NCLEX-RN Review Made Incredibly Easy",
            requester: "Ms. Liza Fernandez",
            dept: "college",
            qty: 3,
            estCost: 6900,
            date: "2026-11-08",
            status: "approved",
            priority: "high",
            note: "For Nursing review program",
          },
          {
            id: "PR-0203",
            title: "Database System Concepts (Silberschatz)",
            requester: "Ms. Liza Fernandez",
            dept: "college",
            qty: 2,
            estCost: 5200,
            date: "2026-11-05",
            status: "ordered",
            priority: "medium",
            note: "BSIT curriculum",
          },
          {
            id: "PR-0204",
            title: "The SPSS Survival Manual",
            requester: "Dr. Perpetua Dela Vega",
            dept: "graduate",
            qty: 2,
            estCost: 4800,
            date: "2026-11-02",
            status: "approved",
            priority: "medium",
            note: "Thesis research support",
          },
          {
            id: "PR-0205",
            title: "Organic Chemistry (McMurry)",
            requester: "Mr. Juanito Reyes",
            dept: "shs",
            qty: 3,
            estCost: 7500,
            date: "2026-10-28",
            status: "received",
            priority: "low",
            note: "STEM track",
          },
          {
            id: "PR-0206",
            title: "Goodnight Moon (board book edition)",
            requester: "Ms. Tessie Bernal",
            dept: "gs",
            qty: 5,
            estCost: 2500,
            date: "2026-10-25",
            status: "rejected",
            priority: "low",
            note: "Rejected — duplicate of existing holdings",
          },
          {
            id: "PR-0207",
            title: "Robotics for Beginners",
            requester: "Ms. Rowena Ignacio",
            dept: "jhs",
            qty: 4,
            estCost: 3200,
            date: "2026-11-12",
            status: "pending",
            priority: "medium",
            note: "STEM club",
          },
        ],
        suppliers: [
          {
            id: "SUP-01",
            name: "Rex Book Store Inc.",
            contact: "Sales Division",
            email: "sales@rexbooks.com.ph",
            phone: "(02) 8731-1111",
            city: "Manila",
            terms: "Net 30",
            rating: 4.5,
          },
          {
            id: "SUP-02",
            name: "National Book Store",
            contact: "Corporate Sales",
            email: "corp@nationalbookstore.com.ph",
            phone: "(054) 821-4400",
            city: "Naga City",
            terms: "Net 15",
            rating: 4.2,
          },
          {
            id: "SUP-03",
            name: "Phoenix Publishing House",
            contact: "Orders Desk",
            email: "orders@phoenix.com.ph",
            phone: "(02) 8361-3511",
            city: "Quezon City",
            terms: "Net 30",
            rating: 4.0,
          },
          {
            id: "SUP-04",
            name: "Vibal Group Inc.",
            contact: "Customer Care",
            email: "customercare@vibal.com.ph",
            phone: "(02) 8373-8888",
            city: "Quezon City",
            terms: "Net 45",
            rating: 4.6,
          },
          {
            id: "SUP-05",
            name: "Anvil Publishing",
            contact: "Marketing",
            email: "marketing@anvilpublishing.com.ph",
            phone: "(02) 8848-1631",
            city: "Makati City",
            terms: "Net 30",
            rating: 4.3,
          },
        ],
        orders: [
          {
            id: "PO-2026-011",
            supplierId: "SUP-01",
            items: 12,
            cost: 48600,
            date: "2026-10-15",
            expected: "2026-11-20",
            status: "ordered",
          },
          {
            id: "PO-2026-012",
            supplierId: "SUP-04",
            items: 8,
            cost: 31200,
            date: "2026-10-02",
            expected: "2026-10-30",
            status: "received",
          },
          {
            id: "PO-2026-013",
            supplierId: "SUP-02",
            items: 15,
            cost: 22750,
            date: "2026-11-03",
            expected: "2026-11-25",
            status: "partial",
          },
          {
            id: "PO-2026-014",
            supplierId: "SUP-03",
            items: 6,
            cost: 9800,
            date: "2026-09-12",
            expected: "2026-10-05",
            status: "received",
          },
        ],
        budget: [
          { dept: "college", allocated: 350000, spent: 214500 },
          { dept: "graduate", allocated: 150000, spent: 61200 },
          { dept: "shs", allocated: 90000, spent: 52300 },
          { dept: "jhs", allocated: 60000, spent: 18750 },
          { dept: "gs", allocated: 50000, spent: 31400 },
        ],
        serials: [
          {
            id: "SR-01",
            title: "Philippine Journal of Nursing",
            type: "journal",
            publisher: "Philippine Nurses Association",
            frequency: "Quarterly",
            issn: "0048-3753",
            dept: "college",
            subStatus: "active",
            received: 3,
            expected: 4,
            nextDue: "2026-12-15",
            price: 4500,
          },
          {
            id: "SR-02",
            title: "Philippine Journal of Development",
            type: "journal",
            publisher: "PIDS",
            frequency: "Semi-annual",
            issn: "0115-5997",
            dept: "college",
            subStatus: "active",
            received: 1,
            expected: 2,
            nextDue: "2026-12-30",
            price: 3200,
          },
          {
            id: "SR-03",
            title: "National Geographic",
            type: "magazine",
            publisher: "National Geographic Partners",
            frequency: "Monthly",
            issn: "0027-9358",
            dept: "college",
            subStatus: "active",
            received: 10,
            expected: 12,
            nextDue: "2026-12-01",
            price: 8900,
          },
          {
            id: "SR-04",
            title: "Philippine Daily Inquirer",
            type: "newspaper",
            publisher: "Inquirer Group",
            frequency: "Daily",
            issn: "1053-9522",
            dept: "college",
            subStatus: "active",
            received: 280,
            expected: 300,
            nextDue: "2026-11-16",
            price: 6500,
          },
          {
            id: "SR-05",
            title: "TIME Magazine",
            type: "magazine",
            publisher: "TIME USA",
            frequency: "Weekly",
            issn: "0040-781X",
            dept: "college",
            subStatus: "active",
            received: 41,
            expected: 46,
            nextDue: "2026-11-17",
            price: 11200,
          },
          {
            id: "SR-06",
            title: "Harvard Business Review",
            type: "magazine",
            publisher: "Harvard Business Publishing",
            frequency: "Bimonthly",
            issn: "0017-8012",
            dept: "graduate",
            subStatus: "active",
            received: 5,
            expected: 6,
            nextDue: "2026-12-10",
            price: 9800,
          },
          {
            id: "SR-07",
            title: "Educational Leadership (ASCD)",
            type: "journal",
            publisher: "ASCD",
            frequency: "Monthly",
            issn: "0013-1784",
            dept: "graduate",
            subStatus: "active",
            received: 9,
            expected: 10,
            nextDue: "2026-12-01",
            price: 7400,
          },
          {
            id: "SR-08",
            title: "Sining at Kultura",
            type: "journal",
            publisher: "UP Press",
            frequency: "Quarterly",
            issn: "2012-6646",
            dept: "graduate",
            subStatus: "trial",
            received: 1,
            expected: 1,
            nextDue: "2027-01-15",
            price: 0,
          },
          {
            id: "SR-09",
            title: "Science & Society Magazine",
            type: "magazine",
            publisher: "DOST-ASTI",
            frequency: "Monthly",
            issn: "2244-0178",
            dept: "shs",
            subStatus: "active",
            received: 9,
            expected: 10,
            nextDue: "2026-12-05",
            price: 2800,
          },
          {
            id: "SR-10",
            title: "Liwayway",
            type: "magazine",
            publisher: "Liwayway Marketing",
            frequency: "Weekly",
            issn: "0024-4627",
            dept: "gs",
            subStatus: "active",
            received: 40,
            expected: 46,
            nextDue: "2026-11-18",
            price: 1900,
          },
          {
            id: "SR-11",
            title: "Reader's Digest Asia",
            type: "magazine",
            publisher: "Reader's Digest",
            frequency: "Monthly",
            issn: "0034-0383",
            dept: "shs",
            subStatus: "expired",
            received: 6,
            expected: 12,
            nextDue: "—",
            price: 5600,
          },
        ],
        inventoryFlags: [
          {
            id: "IF-01",
            bookId: "BK-1013",
            type: "missing",
            qty: 1,
            note: "Not located during October stocktake",
            date: "2026-10-20",
            status: "open",
            by: "Eduardo Santos",
          },
          {
            id: "IF-02",
            bookId: "BK-1015",
            type: "lost",
            qty: 1,
            note: "Reported lost by borrower (see FIN-0301)",
            date: "2026-11-08",
            status: "open",
            by: "Juanito Reyes",
          },
          {
            id: "IF-03",
            bookId: "BK-1024",
            type: "damaged",
            qty: 1,
            note: "Water damage pp. 40–55, repair completed",
            date: "2026-11-01",
            status: "resolved",
            by: "Liza Fernandez",
          },
          {
            id: "IF-04",
            bookId: "BK-1005",
            type: "damaged",
            qty: 1,
            note: "Detached spine — awaiting rebinding",
            date: "2026-10-15",
            status: "open",
            by: "Eduardo Santos",
          },
          {
            id: "IF-05",
            bookId: "BK-1031",
            type: "missing",
            qty: 1,
            note: "Misshelved copy located in JHS-AP shelf",
            date: "2026-09-18",
            status: "resolved",
            by: "Rowena Ignacio",
          },
        ],
        stocktakes: [
          {
            id: "ST-2026-03",
            date: "2026-10-18",
            scope: "College Library — partial (Nursing & IT sections)",
            verified: 1420,
            expected: 1450,
            missing: 12,
            damaged: 9,
            accuracy: 97.9,
            by: "Eduardo Santos",
            status: "completed",
          },
          {
            id: "ST-2026-02",
            date: "2026-08-14",
            scope: "Graduate School Library — full",
            verified: 610,
            expected: 612,
            missing: 1,
            damaged: 1,
            accuracy: 99.7,
            by: "Ramon Delgado",
            status: "completed",
          },
          {
            id: "ST-2026-01",
            date: "2026-03-10",
            scope: "Senior High School Library — full",
            verified: 1105,
            expected: 1121,
            missing: 9,
            damaged: 7,
            accuracy: 98.6,
            by: "Juanito Reyes",
            status: "completed",
          },
        ],
        notifications: [
          {
            id: "N-01",
            type: "overdue",
            title: "Overdue: Noli Me Tangere",
            body: "Copy borrowed by Angela Nicole Pascual (P-1003) was due Nov 1, 2026. An overdue reminder has been queued.",
            date: "2026-11-15",
            audience: "college",
            read: false,
            priority: "high",
          },
          {
            id: "N-02",
            type: "reservation",
            title: "Reservation ready for pickup",
            body: "Fundamentals of Nursing is ready for Christine Joy Alcantara at the College circulation desk. Hold expires in 3 days.",
            date: "2026-11-13",
            audience: "college",
            read: false,
            priority: "medium",
          },
          {
            id: "N-03",
            type: "due",
            title: "Due date reminder",
            body: "3 items are due within the next 3 days across the College Library.",
            date: "2026-11-14",
            audience: "college",
            read: false,
            priority: "low",
          },
          {
            id: "N-04",
            type: "announcement",
            title: "New arrivals: Nursing references",
            body: "12 new nursing reference titles have been catalogued and are now available at REF-NUR shelves.",
            date: "2026-11-10",
            audience: "college",
            read: true,
            priority: "low",
          },
          {
            id: "N-05",
            type: "system",
            title: "Nightly catalog backup completed (simulated)",
            body: "Prototype background task finished successfully. 36 bibliographic records exported to local snapshot.",
            date: "2026-11-15",
            audience: "staff",
            read: true,
            priority: "low",
          },
          {
            id: "N-06",
            type: "announcement",
            title: "Extended hours during finals week",
            body: "The College and Graduate libraries will be open until 9:00 PM from Nov 23 to Dec 4.",
            date: "2026-11-08",
            audience: "all",
            read: false,
            priority: "medium",
          },
          {
            id: "N-07",
            type: "overdue",
            title: "Overdue reminders batch sent",
            body: "Automated overdue reminders were sent (simulated) to 4 patrons with overdue items.",
            date: "2026-11-14",
            audience: "staff",
            read: true,
            priority: "low",
          },
          {
            id: "N-08",
            type: "reservation",
            title: "Reservation expired",
            body: "Reservation RSV-0508 (Principles of Marketing — Patricia Mae Villanueva) expired without pickup.",
            date: "2026-10-24",
            audience: "college",
            read: true,
            priority: "low",
          },
          {
            id: "N-09",
            type: "announcement",
            title: "Annual Book Fair: Nov 24–28",
            body: "Join the book fair at the Main Library Lobby with participating local publishers.",
            date: "2026-11-12",
            audience: "all",
            read: false,
            priority: "low",
          },
          {
            id: "N-10",
            type: "system",
            title: "Koha test environment unreachable (simulated)",
            body: "Integration probe to the future Koha ILS test server is disabled in this prototype. No live connection exists.",
            date: "2026-11-09",
            audience: "staff",
            read: true,
            priority: "medium",
          },
        ],
        templates: [
          {
            id: "TPL-01",
            name: "Overdue Reminder",
            subject: "[USANT Library] Your book is overdue",
            body: 'Dear {patron_name},\n\nOur records show that "{book_title}" (due {due_date}) has not been returned. Current fine: {fine_amount}.\n\nPlease return the item to the {department} circulation desk at your earliest convenience.\n\n— USANT University Library (simulated notice)',
          },
          {
            id: "TPL-02",
            name: "Reservation Ready",
            subject: "[USANT Library] Your reservation is ready",
            body: 'Dear {patron_name},\n\n"{book_title}" is now ready for pickup at the {department} circulation desk. Please claim it within {hold_days} days.\n\n— USANT University Library (simulated notice)',
          },
          {
            id: "TPL-03",
            name: "Due Date Reminder",
            subject: "[USANT Library] Upcoming due date",
            body: 'Dear {patron_name},\n\nThis is a reminder that "{book_title}" is due on {due_date}. You may renew online via the Student Portal if eligible.\n\n— USANT University Library (simulated notice)',
          },
          {
            id: "TPL-04",
            name: "New Arrivals Announcement",
            subject: "[USANT Library] New arrivals this week",
            body: "Hello!\n\n{count} new titles have arrived at the {department}. Visit the Student Portal or the new arrivals shelf to explore.\n\n— USANT University Library (simulated notice)",
          },
        ],
        documents: [
          {
            id: "DOC-01",
            title: "USANT Library Manual 2026",
            category: "Policies",
            type: "PDF",
            size: "4.2 MB",
            by: "Corazon Villareal",
            date: "2026-01-15",
            access: "staff",
            desc: "Consolidated library policies, procedures and service standards.",
          },
          {
            id: "DOC-02",
            title: "Circulation Policy Memorandum No. 12",
            category: "Policies",
            type: "PDF",
            size: "820 KB",
            by: "Eduardo Santos",
            date: "2026-09-02",
            access: "staff",
            desc: "Updated loan periods and renewal rules for all departments.",
          },
          {
            id: "DOC-03",
            title: "Annual Library Report FY2025",
            category: "Reports",
            type: "DOCX",
            size: "2.1 MB",
            by: "Corazon Villareal",
            date: "2026-02-10",
            access: "admin",
            desc: "Year-end statistics, accomplishments and financial summary.",
          },
          {
            id: "DOC-04",
            title: "Student Handbook — Library Section",
            category: "Handbooks",
            type: "PDF",
            size: "1.5 MB",
            by: "Liza Fernandez",
            date: "2026-06-20",
            access: "all",
            desc: "Library rules and borrowing privileges for students.",
          },
          {
            id: "DOC-05",
            title: "Cataloguing Guidelines (RDA basics)",
            category: "Guidelines",
            type: "PDF",
            size: "3.4 MB",
            by: "Eduardo Santos",
            date: "2026-05-14",
            access: "staff",
            desc: "Local cataloguing conventions pending Koha migration.",
          },
          {
            id: "DOC-06",
            title: "Library Budget Proposal FY2027",
            category: "Finance",
            type: "XLSX",
            size: "640 KB",
            by: "Corazon Villareal",
            date: "2026-10-01",
            access: "admin",
            desc: "Proposed acquisitions and operating budget by department.",
          },
          {
            id: "DOC-07",
            title: "Accreditation Documents — Library",
            category: "Accreditation",
            type: "PDF",
            size: "8.9 MB",
            by: "Ramon Delgado",
            date: "2026-03-22",
            access: "admin",
            desc: "Supporting documents for PACU/FAAP library accreditation.",
          },
          {
            id: "DOC-08",
            title: "Facilities Use Agreement Template",
            category: "Forms",
            type: "DOCX",
            size: "210 KB",
            by: "Juanito Reyes",
            date: "2026-07-30",
            access: "all",
            desc: "Standard agreement for study room and equipment borrowing.",
          },
          {
            id: "DOC-09",
            title: "Inventory Stocktake Form",
            category: "Forms",
            type: "PDF",
            size: "180 KB",
            by: "Eduardo Santos",
            date: "2026-04-18",
            access: "staff",
            desc: "Printable shelf-by-shelf verification worksheet.",
          },
          {
            id: "DOC-10",
            title: "Data Privacy Notice (Library Records)",
            category: "Policies",
            type: "PDF",
            size: "300 KB",
            by: "Corazon Villareal",
            date: "2026-08-08",
            access: "all",
            desc: "How patron records are handled under the Data Privacy Act.",
          },
        ],
        facilities: [
          {
            id: "FR-01",
            name: "Study Room A",
            type: "study-room",
            capacity: 4,
            location: "Main Library · 2nd Floor",
            dept: "college",
            status: "active",
          },
          {
            id: "FR-02",
            name: "Study Room B",
            type: "study-room",
            capacity: 4,
            location: "Main Library · 2nd Floor",
            dept: "college",
            status: "active",
          },
          {
            id: "FR-03",
            name: "Discussion Room 1",
            type: "discussion-room",
            capacity: 10,
            location: "Main Library · 3rd Floor",
            dept: "college",
            status: "active",
          },
          {
            id: "FR-04",
            name: "Graduate Research Room",
            type: "discussion-room",
            capacity: 6,
            location: "Graduate Library · 4th Floor",
            dept: "graduate",
            status: "active",
          },
          {
            id: "FR-05",
            name: "SHS Group Study Area",
            type: "study-room",
            capacity: 8,
            location: "SHS Library",
            dept: "shs",
            status: "active",
          },
          {
            id: "FR-06",
            name: "e-Library Computer Stations (1–10)",
            type: "computer",
            capacity: 10,
            location: "Main Library · 1st Floor",
            dept: "college",
            status: "active",
          },
          {
            id: "FR-07",
            name: "LCD Projector (Epson EB-X51)",
            type: "equipment",
            capacity: 1,
            location: "Circulation Desk",
            dept: "college",
            status: "active",
          },
          {
            id: "FR-08",
            name: "Laptop Loan Units (3 pcs)",
            type: "equipment",
            capacity: 3,
            location: "Circulation Desk",
            dept: "college",
            status: "maintenance",
          },
        ],
        bookings: [
          {
            id: "FB-01",
            resourceId: "FR-01",
            patronId: "P-1001",
            date: "2026-11-15",
            start: "13:00",
            end: "15:00",
            status: "approved",
            purpose: "Nursing group study",
          },
          {
            id: "FB-02",
            resourceId: "FR-03",
            patronId: "P-1002",
            date: "2026-11-15",
            start: "09:00",
            end: "11:00",
            status: "approved",
            purpose: "Capstone project meeting",
          },
          {
            id: "FB-03",
            resourceId: "FR-01",
            patronId: "P-1007",
            date: "2026-11-16",
            start: "10:00",
            end: "12:00",
            status: "pending",
            purpose: "Anatomy review group",
          },
          {
            id: "FB-04",
            resourceId: "FR-04",
            patronId: "P-1101",
            date: "2026-11-17",
            start: "13:00",
            end: "16:00",
            status: "pending",
            purpose: "Thesis writing session",
          },
          {
            id: "FB-05",
            resourceId: "FR-05",
            patronId: "P-1301",
            date: "2026-11-15",
            start: "14:00",
            end: "16:00",
            status: "approved",
            purpose: "SHS research work",
          },
          {
            id: "FB-06",
            resourceId: "FR-07",
            patronId: "P-1012",
            date: "2026-11-18",
            start: "08:00",
            end: "12:00",
            status: "pending",
            purpose: "Class presentation",
          },
          {
            id: "FB-07",
            resourceId: "FR-02",
            patronId: "P-1003",
            date: "2026-11-14",
            start: "15:00",
            end: "17:00",
            status: "completed",
            purpose: "Peer tutoring",
          },
          {
            id: "FB-08",
            resourceId: "FR-06",
            patronId: "P-1008",
            date: "2026-11-15",
            start: "10:00",
            end: "12:00",
            status: "approved",
            purpose: "Programming practice",
          },
          {
            id: "FB-09",
            resourceId: "FR-03",
            patronId: "P-1004",
            date: "2026-11-19",
            start: "13:00",
            end: "15:00",
            status: "pending",
            purpose: "Criminology board review",
          },
          {
            id: "FB-10",
            resourceId: "FR-08",
            patronId: "P-1011",
            date: "2026-11-16",
            start: "09:00",
            end: "17:00",
            status: "pending",
            purpose: "Lecture preparation",
          },
          {
            id: "FB-11",
            resourceId: "FR-01",
            patronId: "P-1005",
            date: "2026-11-12",
            start: "10:00",
            end: "12:00",
            status: "cancelled",
            purpose: "Cancelled by patron",
          },
          {
            id: "FB-12",
            resourceId: "FR-05",
            patronId: "P-1303",
            date: "2026-11-20",
            start: "13:00",
            end: "15:00",
            status: "pending",
            purpose: "HUMSS performance task",
          },
        ],
        audit: [
          {
            id: "AUD-9001",
            ts: "2026-11-15 08:02",
            user: "Liza Fernandez",
            action: "Checkout",
            module: "Circulation",
            detail:
              "LN-2407 — Mga Kuwento ni Lola Basyang to Luis Miguel Borja",
            ip: "10.10.4.23",
          },
          {
            id: "AUD-9002",
            ts: "2026-11-15 08:05",
            user: "Liza Fernandez",
            action: "Checkout",
            module: "Circulation",
            detail:
              "LN-2408 — Principles of Marketing to Samantha Louise Dela Cruz",
            ip: "10.10.4.23",
          },
          {
            id: "AUD-9003",
            ts: "2026-11-15 09:12",
            user: "Juanito Reyes",
            action: "Check-in",
            module: "Circulation",
            detail: "LN-2421 — Science Adventures 5 returned",
            ip: "10.10.6.11",
          },
          {
            id: "AUD-9004",
            ts: "2026-11-14 16:40",
            user: "Eduardo Santos",
            action: "Update",
            module: "Cataloguing",
            detail: "Updated call number for BK-1016",
            ip: "10.10.4.9",
          },
          {
            id: "AUD-9005",
            ts: "2026-11-14 15:22",
            user: "Corazon Villareal",
            action: "Approve",
            module: "Acquisitions",
            detail: "PR-0202 approved (₱6,900)",
            ip: "10.10.2.4",
          },
          {
            id: "AUD-9006",
            ts: "2026-11-14 13:05",
            user: "System",
            action: "Batch",
            module: "Notifications",
            detail: "Overdue reminder batch simulated — 4 notices queued",
            ip: "—",
          },
          {
            id: "AUD-9007",
            ts: "2026-11-13 10:47",
            user: "Liza Fernandez",
            action: "Create",
            module: "Reservations",
            detail: "RSV-0501 created for Jose Miguel Ramirez",
            ip: "10.10.4.23",
          },
          {
            id: "AUD-9008",
            ts: "2026-11-12 09:31",
            user: "Ramon Delgado",
            action: "Login",
            module: "Authentication",
            detail: "Super Administrator signed in",
            ip: "10.10.1.2",
          },
          {
            id: "AUD-9009",
            ts: "2026-11-11 14:18",
            user: "Juanito Reyes",
            action: "Record payment",
            module: "Fines",
            detail: "PAY-0004 — ₱2.00 (LN-2424)",
            ip: "10.10.6.11",
          },
          {
            id: "AUD-9010",
            ts: "2026-11-10 11:02",
            user: "Eduardo Santos",
            action: "Create",
            module: "Cataloguing",
            detail: "New record BK-1036 added to Grade School collection",
            ip: "10.10.4.9",
          },
          {
            id: "AUD-9011",
            ts: "2026-11-08 15:55",
            user: "Liza Fernandez",
            action: "Assess fine",
            module: "Fines",
            detail: "FIN-0301 lost-book charge ₱850 (BK-1015)",
            ip: "10.10.4.23",
          },
          {
            id: "AUD-9012",
            ts: "2026-11-05 08:20",
            user: "Corazon Villareal",
            action: "Update",
            module: "Settings",
            detail: "Fine rate confirmed at ₱2.00/day",
            ip: "10.10.2.4",
          },
          {
            id: "AUD-9013",
            ts: "2026-11-03 10:11",
            user: "System",
            action: "Backup",
            module: "Monitoring",
            detail: "Nightly prototype snapshot completed (simulated)",
            ip: "—",
          },
          {
            id: "AUD-9014",
            ts: "2026-10-30 16:44",
            user: "Ramon Delgado",
            action: "Role change",
            module: "Administration",
            detail: "Juanito Reyes assigned to Library Staff role (SHS)",
            ip: "10.10.1.2",
          },
        ],
        logins: [
          {
            id: "LG-501",
            ts: "2026-11-15 07:58",
            user: "Liza Fernandez",
            role: "librarian",
            status: "success",
            ip: "10.10.4.23",
          },
          {
            id: "LG-502",
            ts: "2026-11-15 07:41",
            user: "Maria Clara Bautista",
            role: "student",
            status: "success",
            ip: "10.10.9.55",
          },
          {
            id: "LG-503",
            ts: "2026-11-14 17:02",
            user: "Juanito Reyes",
            role: "staff",
            status: "success",
            ip: "10.10.6.11",
          },
          {
            id: "LG-504",
            ts: "2026-11-14 16:55",
            user: "unknown@xmail.com",
            role: "—",
            status: "failed",
            ip: "45.13.20.88",
          },
          {
            id: "LG-505",
            ts: "2026-11-14 08:30",
            user: "Eduardo Santos",
            role: "headlib",
            status: "success",
            ip: "10.10.4.9",
          },
          {
            id: "LG-506",
            ts: "2026-11-13 13:12",
            user: "Corazon Villareal",
            role: "libadmin",
            status: "success",
            ip: "10.10.2.4",
          },
          {
            id: "LG-507",
            ts: "2026-11-12 09:04",
            user: "Ramon Delgado",
            role: "superadmin",
            status: "success",
            ip: "10.10.1.2",
          },
          {
            id: "LG-508",
            ts: "2026-11-11 18:47",
            user: "jmramirez@student.usant.edu.ph",
            role: "student",
            status: "failed",
            ip: "10.10.9.61",
          },
        ],
        activity: [
          {
            id: "AC-1",
            ts: "2026-11-15 09:12",
            text: "Science Adventures 5 returned by Sofia Camille Aguirre",
            type: "return",
            user: "Juanito Reyes",
          },
          {
            id: "AC-2",
            ts: "2026-11-15 08:05",
            text: "Principles of Marketing checked out to Samantha Louise Dela Cruz",
            type: "checkout",
            user: "Liza Fernandez",
          },
          {
            id: "AC-3",
            ts: "2026-11-15 08:02",
            text: "Mga Kuwento ni Lola Basyang checked out to Luis Miguel Borja",
            type: "checkout",
            user: "Liza Fernandez",
          },
          {
            id: "AC-4",
            ts: "2026-11-14 15:22",
            text: "Purchase request PR-0202 approved (NCLEX-RN Review ×3)",
            type: "acquisition",
            user: "Corazon Villareal",
          },
          {
            id: "AC-5",
            ts: "2026-11-13 10:47",
            text: "Reservation RSV-0501 placed on Noli Me Tangere",
            type: "reservation",
            user: "System",
          },
          {
            id: "AC-6",
            ts: "2026-11-12 14:30",
            text: "Reservation ready notice sent to Christine Joy Alcantara (simulated)",
            type: "notification",
            user: "System",
          },
          {
            id: "AC-7",
            ts: "2026-11-11 14:18",
            text: "Payment ₱2.00 recorded for late return (LN-2424)",
            type: "payment",
            user: "Juanito Reyes",
          },
          {
            id: "AC-8",
            ts: "2026-11-10 11:02",
            text: "New record catalogued: A Field Guide to Philippine Plants (GS)",
            type: "catalogue",
            user: "Eduardo Santos",
          },
        ],
        announcements: [
          {
            id: "AN-01",
            title: "Finals Week Extended Hours",
            date: "2026-11-08",
            audience: "all",
            body: "College and Graduate libraries open until 9:00 PM, Nov 23 – Dec 4, 2026.",
          },
          {
            id: "AN-02",
            title: "Annual University Book Fair",
            date: "2026-11-12",
            audience: "all",
            body: "Nov 24–28 at the Main Library Lobby. Participating publishers: Rex, Vibal, Phoenix, Anvil.",
          },
          {
            id: "AN-03",
            title: "e-Journal Trial Access",
            date: "2026-11-05",
            audience: "college",
            body: "Trial access to two nursing e-journal databases until Dec 15 (simulated).",
          },
          {
            id: "AN-04",
            title: "Holiday Closure — Nov 30",
            date: "2026-11-14",
            audience: "all",
            body: "All five libraries will be closed on Bonifacio Day (observed), Nov 30, 2026.",
          },
        ],
        faq: [
          {
            q: "How many books can I borrow?",
            a: "Students may borrow up to 3 books for 7 days. Faculty may borrow up to 5 books for 14 days. Graduate students follow faculty limits during thesis season.",
          },
          {
            q: "Can I renew my books online?",
            a: "Yes. Log in to the Student Portal, go to My Loans, and tap Renew. Books can be renewed up to 2 times unless overdue or reserved by another patron.",
          },
          {
            q: "How much is the overdue fine?",
            a: "Fines are ₱2.00 per book per day (simulated rate). Fines must be settled before you can borrow again.",
          },
          {
            q: "How do I reserve a book that is currently borrowed?",
            a: "Search the title in the catalog and tap Reserve. You will be notified (simulated) when a copy is ready for pickup. Holds expire after 3 days.",
          },
          {
            q: "Who can use the study rooms?",
            a: "Currently enrolled students and faculty. Book rooms via Facilities & Reservations. Rooms are held for 15 minutes past the start time.",
          },
          {
            q: "What happens if I lose a library book?",
            a: "Report it to the circulation desk. You will be charged the replacement cost plus a ₱50 processing fee.",
          },
        ],
        hours: [
          {
            dept: "college",
            weekdays: "8:00 AM – 6:00 PM",
            saturday: "8:00 AM – 12:00 PM",
            sunday: "Closed",
          },
          {
            dept: "graduate",
            weekdays: "8:00 AM – 5:00 PM",
            saturday: "8:00 AM – 12:00 PM",
            sunday: "Closed",
          },
          {
            dept: "shs",
            weekdays: "7:30 AM – 5:00 PM",
            saturday: "Closed",
            sunday: "Closed",
          },
          {
            dept: "jhs",
            weekdays: "7:30 AM – 4:30 PM",
            saturday: "Closed",
            sunday: "Closed",
          },
          {
            dept: "gs",
            weekdays: "7:30 AM – 4:00 PM",
            saturday: "Closed",
            sunday: "Closed",
          },
        ],
        permissions: (function () {
          const mods = [
            "Dashboard",
            "Catalog",
            "Cataloguing",
            "Circulation",
            "Reservations",
            "Fines",
            "Acquisitions",
            "Serials",
            "Inventory",
            "Notifications",
            "Reports",
            "Student Portal Mgmt",
            "Services",
            "Documents",
            "Facilities",
            "Visitors",
            "Administration",
            "Import/Export",
            "Monitoring",
            "Settings",
          ];
          const roles = [
            "superadmin",
            "libadmin",
            "headlib",
            "librarian",
            "staff",
          ];
          const m = {};
          mods.forEach(function (mod) {
            m[mod] = {};
            roles.forEach(function (r) {
              m[mod][r] =
                mod === "Administration" ||
                mod === "Monitoring" ||
                mod === "Import/Export"
                  ? r === "superadmin" || r === "libadmin"
                  : mod === "Settings" || mod === "Departments"
                    ? r !== "staff"
                    : true;
            });
          });
          return m;
        })(),
        portalCfg: {
          maxBooks: 3,
          allowRenewals: true,
          allowReservations: true,
          showFines: true,
          announcement:
            "Welcome to the USANT Library Student Portal — prototype demo.",
        },
        monthlyLoans: {
          labels: [
            "Dec",
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
          ],
          counts: [28, 42, 38, 45, 51, 47, 30, 22, 58, 64, 70, 54],
        },
        weeklyCirc: {
          labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          checkouts: [8, 12, 9, 15, 11, 6, 2],
          returns: [6, 10, 8, 12, 13, 5, 1],
        },
        visitors: (function () {
          const rnd = _lcg(20261115);
          const daily = [];
          for (let i = 29; i >= 0; i--) {
            const d = dateAdd(TODAY, -i);
            const dow = new Date(d + "T00:00:00").getDay();
            let c =
              dow === 0
                ? Math.round(15 + rnd() * 40)
                : dow === 6
                  ? Math.round(60 + rnd() * 70)
                  : Math.round(170 + rnd() * 160);
            daily.push({ date: d, count: c });
          }
          const monthly = {
            labels: [
              "Dec",
              "Jan",
              "Feb",
              "Mar",
              "Apr",
              "May",
              "Jun",
              "Jul",
              "Aug",
              "Sep",
              "Oct",
              "Nov",
            ],
            counts: [
              2410, 4180, 3860, 4520, 4990, 4610, 2980, 2210, 5540, 6120, 6690,
              3480,
            ],
          };
          const peak = {
            labels: [
              "7AM",
              "8AM",
              "9AM",
              "10AM",
              "11AM",
              "12PM",
              "1PM",
              "2PM",
              "3PM",
              "4PM",
              "5PM",
              "6PM",
            ],
            counts: [42, 96, 171, 204, 168, 122, 151, 226, 248, 190, 121, 58],
          };
          const byDept = [
            { dept: "college", share: 46 },
            { dept: "shs", share: 19 },
            { dept: "jhs", share: 13 },
            { dept: "graduate", share: 12 },
            { dept: "gs", share: 10 },
          ];
          return {
            daily: daily,
            monthly: monthly,
            peak: peak,
            byDept: byDept,
            today: daily[daily.length - 1].count,
          };
        })(),
        monitoring: {
          services: [
            {
              name: "Web Application",
              status: "operational",
              latency: "38 ms",
            },
            {
              name: "Authentication Service",
              status: "operational",
              latency: "21 ms",
            },
            {
              name: "Catalog Search Index",
              status: "operational",
              latency: "44 ms",
            },
            {
              name: "Database (simulated)",
              status: "operational",
              latency: "12 ms",
            },
            {
              name: "Koha ILS Integration",
              status: "not-connected",
              latency: "—",
            },
            {
              name: "Notification Worker",
              status: "degraded",
              latency: "310 ms",
            },
            { name: "Backup Scheduler", status: "operational", latency: "—" },
          ],
          tasks: [
            {
              name: "Nightly catalog backup",
              schedule: "Daily 02:00",
              lastRun: "2026-11-15 02:00",
              status: "success",
            },
            {
              name: "Overdue notice dispatch",
              schedule: "Daily 06:00",
              lastRun: "2026-11-15 06:00",
              status: "success",
            },
            {
              name: "Search index rebuild",
              schedule: "Weekly Sun 03:00",
              lastRun: "running (62%)",
              status: "running",
            },
            {
              name: "Visitor statistics rollup",
              schedule: "Daily 23:30",
              lastRun: "2026-11-14 23:30",
              status: "success",
            },
            {
              name: "Koha sync probe",
              schedule: "Every 15 min",
              lastRun: "skipped — not connected",
              status: "skipped",
            },
          ],
          errors: [
            {
              ts: "2026-11-15 06:04",
              level: "warn",
              source: "notifications",
              message:
                "Email gateway not configured — 4 overdue notices stored in outbox (simulated)",
            },
            {
              ts: "2026-11-14 22:17",
              level: "error",
              source: "koha-probe",
              message:
                "Integration endpoint disabled in prototype. No live Koha connection attempted.",
            },
            {
              ts: "2026-11-14 14:52",
              level: "warn",
              source: "search",
              message: "Index rebuild took 8.4s (> 5s threshold)",
            },
            {
              ts: "2026-11-13 09:30",
              level: "info",
              source: "auth",
              message:
                "3 failed login attempts from one IP — throttled (simulated)",
            },
          ],
          events: [
            {
              ts: "2026-11-15 08:00",
              text: "Application started (prototype session)",
            },
            {
              ts: "2026-11-15 02:00",
              text: "Nightly backup completed — 36 biblio records snapshotted",
            },
            {
              ts: "2026-11-14 23:30",
              text: "Visitor statistics rollup completed",
            },
            {
              ts: "2026-11-14 15:00",
              text: "Settings updated by Library Administrator (fine rate verified)",
            },
            {
              ts: "2026-11-13 03:00",
              text: "Weekly search index rebuild started",
            },
          ],
        },
      };

      /* loans & reservations: attach dept from book */
      SEED.loans = _L.map(function (r) {
        const bk = SEED.books.find((b) => b.id === r[1]);
        const p = SEED.patrons.find((x) => x.id === r[2]);
        return {
          id: r[0],
          bookId: r[1],
          patronId: r[2],
          dept: bk ? bk.dept : "college",
          ptype: p ? p.type : "student",
          checkout: r[3],
          due: r[4],
          returned: r[5],
          status: r[6],
          renewals: r[7] || 0,
          fineAssessed: r[8] || 0,
        };
      });
      SEED.reservations = _R.map(function (r) {
        const bk = SEED.books.find((b) => b.id === r[1]);
        return {
          id: r[0],
          bookId: r[1],
          patronId: r[2],
          dept: bk ? bk.dept : "college",
          date: r[3],
          status: r[4],
          note: r[5],
        };
      });

      /* recompute book availability from loans */
      SEED.books.forEach(function (b) {
        const out = SEED.loans.filter(
          (l) =>
            l.bookId === b.id &&
            (l.status === "active" || l.status === "overdue"),
        ).length;
        b.available = Math.max(0, b.copies - out);
      });

      /* ---------- Seed & DB ---------- */
      const Seed = {
        init: function (force) {
          if (force || Store.get("seedVer") !== SEED_VER) {
            Object.keys(SEED).forEach(function (k) {
              Store.set(k, SEED[k]);
            });
            Store.set("seedVer", SEED_VER);
          }
        },
        reset: function () {
          Store.clearAll();
          Seed.init(true);
        },
      };

      const DB = {
        get: function (k) {
          Seed.init();
          const v = Store.get(k);
          return v === null ? [] : v;
        },
        set: function (k, v) {
          Store.set(k, v);
        },
        add: function (k, row) {
          const a = DB.get(k);
          a.unshift(row);
          DB.set(k, a);
          return row;
        },
        update: function (k, id, patch) {
          const a = DB.get(k);
          const i = a.findIndex((r) => r.id === id);
          if (i >= 0) {
            a[i] = Object.assign({}, a[i], patch);
            DB.set(k, a);
            return a[i];
          }
          return null;
        },
        remove: function (k, id) {
          const a = DB.get(k).filter((r) => r.id !== id);
          DB.set(k, a);
        },
        audit: function (action, module, detail) {
          const s = Session.get();
          const uname =
            s && s.userId
              ? (DB.get("users").find((u) => u.id === s.userId) || {}).name ||
                s.userId
              : "System";
          const a = DB.get("audit");
          a.unshift({
            id: uid("AUD"),
            ts: nowStr(),
            user: uname,
            action: action,
            module: module,
            detail: detail || "",
            ip: "10.10.4.23",
          });
          if (a.length > 300) a.length = 300;
          DB.set("audit", a);
        },
      };
      function logActivity(text, type, user) {
        const a = DB.get("activity");
        const s = Session.get();
        const uname =
          user ||
          (s && s.userId
            ? (DB.get("users").find((u) => u.id === s.userId) || {}).name
            : "System");
        a.unshift({
          id: uid("AC"),
          ts: nowStr(),
          text: text,
          type: type || "system",
          user: uname || "System",
        });
        if (a.length > 60) a.length = 60;
        DB.set("activity", a);
      }

      /* ---------- lookups ---------- */
      function deptName(id) {
        const d = DEPARTMENTS.find((x) => x.id === id);
        return d ? d.name : id || "—";
      }
      function deptShort(id) {
        const d = DEPARTMENTS.find((x) => x.id === id);
        return d ? d.short : id || "—";
      }
      function bookById(id) {
        return DB.get("books").find((b) => b.id === id);
      }
      function bookTitle(id) {
        const b = bookById(id);
        return b ? b.title : id;
      }
      function patronById(id) {
        return DB.get("patrons").find((p) => p.id === id);
      }
      function patronName(id) {
        const p = patronById(id);
        return p ? p.name : id;
      }
      function patronLabel(p) {
        return p ? p.name + " (" + p.no + ")" : "";
      }
      function settings() {
        return DB.get("settings") || SEED.settings;
      }
      function paidFor(ref) {
        return DB.get("payments")
          .filter((p) => p.ref === ref)
          .reduce((s, p) => s + Number(p.amount || 0), 0);
      }
      function loanStatus(l) {
        if (l.returned) return "returned";
        if (daysLate(l.due) > 0) return "overdue";
        return "active";
      }
      function loanFine(l) {
        const S = settings();
        const late = daysLate(l.due, l.returned || todayStr());
        return late > 0 ? late * S.finePerDay : l.fineAssessed || 0;
      }
      function syncAvailability(bookId) {
        const b = bookById(bookId);
        if (!b) return;
        const out = DB.get("loans").filter(
          (l) =>
            l.bookId === bookId &&
            (l.status === "active" || l.status === "overdue") &&
            !l.returned,
        ).length;
        b.available = Math.max(0, b.copies - out);
        const books = DB.get("books");
        const i = books.findIndex((x) => x.id === bookId);
        books[i] = b;
        DB.set("books", books);
      }
      Seed.init();

      
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
                "Password reset is simulated in this prototype. Use the demo password \u201cusant123\u201d.",
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
              btn.innerHTML = '<span class="spinner"></span> Signing in\u2026';
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

      /* FILE: js/auth.js — simulated authentication & session */
      const Session = {
        get() {
          return Store.get("session", null);
        },
        set(s) {
          Store.set("session", s);
        },
        clear() {
          Store.del("session");
        },
        user() {
          const s = Session.get();
          if (!s || !s.userId) return null;
          return DB.get("users").find((u) => u.id === s.userId) || null;
        },
        role() {
          const u = Session.user();
          return u ? u.role : null;
        },
        level() {
          const r = Session.role();
          const rr = ROLES.find((x) => x.id === r);
          return rr ? rr.level : 0;
        },
        dept() {
          const s = Session.get();
          if (s && s.dept) return s.dept;
          const u = Session.user();
          return u ? (u.dept === "all" ? "all" : u.dept) : "all";
        },
        setDept(d) {
          const s = Session.get() || {};
          s.dept = d;
          Session.set(s);
        },
        patronId() {
          const u = Session.user();
          return u && u.patronId ? u.patronId : null;
        },
        atLeast(level) {
          return Session.level() >= level;
        },
      };
      const Auth = {
        login(email, pw) {
          Seed.init();
          const u = DB.get("users").find(
            (x) => x.email.toLowerCase() === String(email).toLowerCase(),
          );
          if (!u)
            return {
              ok: false,
              error: "No account found for this email address.",
            };
          if (u.status !== "active")
            return {
              ok: false,
              error:
                "This account is deactivated. Contact the Library Administrator.",
            };
          if (pw !== u.password && pw !== "usant123")
            return {
              ok: false,
              error: "Incorrect password. (Demo password: usant123)",
            };
          const users = DB.get("users");
          const i = users.findIndex((x) => x.id === u.id);
          users[i].lastLogin = nowStr();
          DB.set("users", users);
          Session.set({
            userId: u.id,
            dept: u.dept === "all" ? "all" : u.dept,
            loginAt: nowStr(),
          });
          DB.audit(
            "Login",
            "Authentication",
            u.name +
              " signed in (" +
              (ROLES.find((r) => r.id === u.role) || {}).label +
              ")",
          );
          return { ok: true, user: u };
        },
        demoLogin(userId) {
          const u = DB.get("users").find((x) => x.id === userId);
          if (!u) {
            UI.toast("Demo account not found", "error");
            return;
          }
          Session.set({
            userId: u.id,
            dept: u.dept === "all" ? "all" : u.dept,
            loginAt: nowStr(),
          });
          DB.audit("Login", "Authentication", "Demo login as " + u.name);
          UI.toast(
            "Signed in as " +
              u.name +
              " (" +
              (ROLES.find((r) => r.id === u.role) || {}).label +
              ")",
            "success",
          );
          setTimeout(function () {
            Proto.goAfterLogin(u);
          }, 400);
        },
        logout() {
          const u = Session.user();
          if (u) DB.audit("Logout", "Authentication", u.name + " signed out");
          Session.clear();
          Proto.screen("login"); location.hash = "";
        },
        requireStaff() {
          const s = Session.get();
          if (!s || !s.userId) {
            Proto.screen("login");
            return false;
          }
          if (Session.role() === "student") {
            Proto.screen("student");
            return false;
          }
          return true;
        },
      };

      /* FILE: js/app.js — admin shell, UI component library, router */
      window.Modules = {};

      const NAV = [
        {
          group: "Overview",
          items: [
            { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
            {
              id: "reports",
              label: "Reports & Analytics",
              icon: "bar-chart-3",
            },
            {
              id: "visitors",
              label: "Visitor Statistics",
              icon: "users-round",
            },
          ],
        },
        {
          group: "Library Operations",
          items: [
            { id: "catalog", label: "Catalog Search", icon: "search" },
            { id: "cataloguing", label: "Cataloguing", icon: "book-plus" },
            { id: "circulation", label: "Book Circulation", icon: "repeat" },
            { id: "reservations", label: "Reservations", icon: "bookmark" },
            { id: "fines", label: "Fines & Payments", icon: "banknote" },
          ],
        },
        {
          group: "Collections",
          items: [
            {
              id: "acquisitions",
              label: "Acquisitions",
              icon: "shopping-cart",
            },
            {
              id: "serials",
              label: "Serials & Periodicals",
              icon: "newspaper",
            },
            { id: "inventory", label: "Inventory", icon: "clipboard-list" },
            { id: "documents", label: "Documents", icon: "file-text" },
          ],
        },
        {
          group: "Patron Services",
          items: [
            { id: "patrons", label: "Patrons", icon: "contact-round" },
            {
              id: "student-portal",
              label: "Student Portal Mgmt",
              icon: "graduation-cap",
              minLevel: 2,
            },
            { id: "services", label: "Library Services", icon: "library" },
            {
              id: "facilities",
              label: "Facilities & Reservations",
              icon: "door-open",
            },
            { id: "notifications", label: "Notifications", icon: "bell" },
          ],
        },
        {
          group: "Administration",
          items: [
            {
              id: "departments",
              label: "Departments",
              icon: "building-2",
              minLevel: 3,
            },
            {
              id: "administration",
              label: "Administration & Audit",
              icon: "shield",
              minLevel: 4,
            },
            {
              id: "import-export",
              label: "Import / Export",
              icon: "file-up",
              minLevel: 4,
            },
            {
              id: "monitoring",
              label: "System Monitoring",
              icon: "activity",
              minLevel: 3,
            },
            { id: "settings", label: "Settings", icon: "settings" },
          ],
        },
      ];
      function flatNav() {
        const out = [];
        NAV.forEach((g) =>
          g.items.forEach((i) =>
            out.push(Object.assign({ group: g.group }, i)),
          ),
        );
        return out;
      }

      /* =============== UI component library =============== */
      const UI = {
        _dtc: 0,
        _timers: [],
        icons() {
          if (window.lucide) lucide.createIcons();
        },
        perPage() {
          const p = Store.get("prefs", {});
          return (p && p.perPage) || 10;
        },
        timer(fn) {
          UI._timers.push(setInterval(fn, 3000));
        },
        clearTimers() {
          UI._timers.forEach(clearInterval);
          UI._timers = [];
        },

        toast(msg, type) {
          type = type || "success";
          const r = document.getElementById("toast-root");
          if (!r) return;
          const icons = {
            success: "check-circle-2",
            error: "alert-circle",
            info: "info",
            warning: "alert-triangle",
          };
          const t = document.createElement("div");
          t.className = "toast toast-" + type;
          t.innerHTML =
            '<i data-lucide="' +
            (icons[type] || "info") +
            '" class="w-4 h-4 flex-shrink-0"></i><span>' +
            esc(msg) +
            "</span>";
          r.appendChild(t);
          lucide.createIcons();
          requestAnimationFrame(() => t.classList.add("show"));
          setTimeout(() => {
            t.classList.remove("show");
            setTimeout(() => t.remove(), 300);
          }, 3800);
        },

        modal(o) {
          const root = document.getElementById("modal-root");
          const sizes = {
            sm: "max-w-md",
            md: "max-w-2xl",
            lg: "max-w-4xl",
            xl: "max-w-6xl",
          };
          root.innerHTML =
            '<div class="modal-overlay"><div class="modal-panel ' +
            (sizes[o.size || "md"] || sizes.md) +
            '">' +
            '<div class="modal-head"><div><h3>' +
            (o.title || "") +
            "</h3>" +
            (o.subtitle ? '<p class="modal-sub">' + o.subtitle + "</p>" : "") +
            "</div>" +
            '<button class="icon-btn" data-x aria-label="Close"><i data-lucide="x" class="w-5 h-5"></i></button></div>' +
            '<div class="modal-body">' +
            (o.body || "") +
            "</div>" +
            (o.footer ? '<div class="modal-foot">' + o.footer + "</div>" : "") +
            "</div></div>";
          lucide.createIcons();
          const close = () => {
            root.innerHTML = "";
            document.removeEventListener("keydown", esc);
          };
          const esc = (e) => {
            if (e.key === "Escape") close();
          };
          document.addEventListener("keydown", esc);
          root.querySelector("[data-x]").onclick = close;
          root
            .querySelector(".modal-overlay")
            .addEventListener("click", (e) => {
              if (e.target === e.currentTarget) close();
            });
          if (o.onOpen) o.onOpen(root.querySelector(".modal-panel"), close);
          return { el: root.querySelector(".modal-panel"), close: close };
        },

        confirm(o) {
          const m = UI.modal({
            title: o.title || "Confirm action",
            size: "sm",
            body:
              '<p class="text-sm text-ink/80">' +
              (o.message || "Are you sure?") +
              "</p>",
            footer:
              '<button class="btn btn-outline" data-c>Cancel</button><button class="btn ' +
              (o.danger === false ? "btn-primary" : "btn-danger") +
              '" data-ok>' +
              (o.confirmText || "Confirm") +
              "</button>",
          });
          m.el.querySelector("[data-c]").onclick = m.close;
          m.el.querySelector("[data-ok]").onclick = () => {
            m.close();
            if (o.onConfirm) o.onConfirm();
          };
        },

        drawer(o) {
          const root = document.getElementById("drawer-root");
          root.innerHTML =
            '<div class="drawer-overlay" data-dov></div><div class="drawer-panel" style="' +
            (o.width ? "width:" + o.width : "") +
            '">' +
            '<div class="drawer-head"><div><div class="text-[11px] uppercase tracking-widest text-gold-light font-semibold">' +
            (o.kicker || "") +
            '</div><h3 class="font-serif text-lg font-bold">' +
            (o.title || "") +
            "</h3>" +
            (o.subtitle
              ? '<div class="text-xs text-warm/70 mt-0.5">' +
                o.subtitle +
                "</div>"
              : "") +
            "</div>" +
            '<button class="icon-btn !text-warm hover:!bg-white/10" data-x><i data-lucide="x" class="w-5 h-5"></i></button></div>' +
            '<div class="drawer-body">' +
            (o.body || "") +
            "</div>" +
            (o.footer
              ? '<div class="p-4 border-t border-ink/10 flex gap-2 justify-end">' +
                o.footer +
                "</div>"
              : "") +
            "</div>";
          lucide.createIcons();
          const close = () => (root.innerHTML = "");
          root.querySelector("[data-x]").onclick = close;
          root.querySelector("[data-dov]").onclick = close;
          if (o.onOpen) o.onOpen(root, close);
          return { el: root, close: close };
        },

        field(f, vals) {
          const v =
            vals && vals[f.name] !== undefined && vals[f.name] !== null
              ? vals[f.name]
              : f.value !== undefined
                ? f.value
                : "";
          const span = f.span === 2 ? "md:col-span-2" : "";
          if (f.type === "section")
            return (
              '<div class="md:col-span-2 section-label">' + f.label + "</div>"
            );
          if (f.type === "static")
            return (
              '<div class="' +
              span +
              '"><div class="label">' +
              f.label +
              '</div><div class="text-sm font-medium">' +
              v +
              "</div></div>"
            );
          let inp = "";
          if (f.type === "select") {
            inp =
              '<select class="input w-full" name="' +
              f.name +
              '" ' +
              (f.disabled ? "disabled" : "") +
              ">" +
              (f.placeholder
                ? '<option value="">' + f.placeholder + "</option>"
                : "") +
              (f.options || [])
                .map(function (op) {
                  const ov = op.v !== undefined ? op.v : op,
                    ol = op.l !== undefined ? op.l : op;
                  return (
                    '<option value="' +
                    esc(ov) +
                    '" ' +
                    (String(ov) === String(v) ? "selected" : "") +
                    ">" +
                    esc(ol) +
                    "</option>"
                  );
                })
                .join("") +
              "</select>";
          } else if (f.type === "textarea") {
            inp =
              '<textarea class="input w-full" name="' +
              f.name +
              '" rows="' +
              (f.rows || 3) +
              '" placeholder="' +
              (f.placeholder || "") +
              '">' +
              esc(v) +
              "</textarea>";
          } else if (f.type === "checkbox") {
            return (
              '<div class="' +
              span +
              ' pt-5"><label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" name="' +
              f.name +
              '" ' +
              (v ? "checked" : "") +
              ' class="w-4 h-4 rounded" style="accent-color:#7D1519"> ' +
              (f.checkLabel || f.label) +
              "</label></div>"
            );
          } else {
            inp =
              '<input class="input w-full" type="' +
              (f.type || "text") +
              '" name="' +
              f.name +
              '" value="' +
              esc(v) +
              '" placeholder="' +
              (f.placeholder || "") +
              '" ' +
              (f.min !== undefined ? 'min="' + f.min + '" ' : "") +
              (f.step ? 'step="' + f.step + '" ' : "") +
              (f.disabled ? "disabled" : "") +
              ">";
          }
          return (
            '<div class="' +
            span +
            '"><label class="label">' +
            f.label +
            (f.required ? ' <span class="text-red-600">*</span>' : "") +
            "</label>" +
            inp +
            '<p class="field-err" data-for="' +
            f.name +
            '"></p></div>'
          );
        },
        collect(form, fields) {
          const out = {};
          let ok = true;
          fields.forEach(function (f) {
            if (f.type === "section" || f.type === "static") return;
            const elx = form.querySelector('[name="' + f.name + '"]');
            if (!elx) return;
            let v = f.type === "checkbox" ? elx.checked : elx.value.trim();
            if (f.type === "number") v = v === "" ? "" : Number(v);
            const err = form.querySelector(
              '.field-err[data-for="' + f.name + '"]',
            );
            if (err) err.textContent = "";
            if (
              f.required &&
              (v === "" ||
                v === null ||
                (f.type === "checkbox" && !v && f.requireChecked))
            ) {
              if (err)
                err.textContent = (f.label || "This field") + " is required";
              ok = false;
            }
            if (
              f.type === "email" &&
              v &&
              !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)
            ) {
              if (err) err.textContent = "Enter a valid email address";
              ok = false;
            }
            if (
              f.type === "number" &&
              v !== "" &&
              f.min !== undefined &&
              Number(v) < f.min
            ) {
              if (err) err.textContent = "Minimum value is " + f.min;
              ok = false;
            }
            out[f.name] = v;
          });
          return ok ? out : null;
        },
        formModal(cfg) {
          const fields = cfg.fields;
          const body =
            '<form id="fm-form" class="grid grid-cols-1 md:grid-cols-2 gap-x-4" onsubmit="return false">' +
            fields.map((f) => UI.field(f, cfg.values)).join("") +
            "</form>";
          const m = UI.modal({
            title: cfg.title,
            subtitle: cfg.subtitle,
            size: cfg.size || "md",
            body: body,
            footer:
              '<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-submit><i data-lucide="' +
              (cfg.icon || "check") +
              '" class="w-4 h-4"></i> ' +
              (cfg.submitText || "Save") +
              "</button>",
          });
          m.el.querySelector("[data-cancel]").onclick = m.close;
          m.el.querySelector("[data-submit]").onclick = function () {
            const vals = UI.collect(m.el.querySelector("#fm-form"), fields);
            if (!vals) {
              UI.toast("Please correct the highlighted fields", "error");
              return;
            }
            cfg.onSubmit(vals, m.close);
          };
          m.el
            .querySelector("#fm-form")
            .addEventListener("keydown", function (e) {
              if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
                e.preventDefault();
                m.el.querySelector("[data-submit]").click();
              }
            });
          return m;
        },

        badge(text, tone) {
          return (
            '<span class="badge badge-' +
            (tone || "gray") +
            '">' +
            esc(text) +
            "</span>"
          );
        },
        statusBadge(st) {
          const map = {
            active: "green",
            overdue: "red",
            returned: "blue",
            paid: "green",
            outstanding: "red",
            partial: "amber",
            pending: "amber",
            approved: "blue",
            ready: "green",
            collected: "gray",
            expired: "red",
            cancelled: "gray",
            received: "green",
            ordered: "blue",
            rejected: "red",
            open: "amber",
            resolved: "green",
            lost: "red",
            missing: "amber",
            damaged: "red",
            success: "green",
            running: "blue",
            skipped: "gray",
            "not-connected": "gray",
            degraded: "amber",
            operational: "green",
            catalogued: "green",
            processing: "amber",
            suspended: "red",
            inactive: "gray",
            maintenance: "amber",
          };
          return UI.badge(String(st).replace(/-/g, " "), map[st] || "gray");
        },
        deptBadge(id) {
          const d = DEPARTMENTS.find((x) => x.id === id);
          if (!d) return UI.badge(id || "—", "gray");
          return (
            '<span class="badge" style="background:' +
            d.color +
            "14;color:" +
            d.color +
            '"><span class="badge-dot" style="background:' +
            d.color +
            '"></span>' +
            esc(d.short) +
            "</span>"
          );
        },

        statCard(c) {
          const tones = {
            maroon: ["#F6E7E7", "#7D1519"],
            gold: ["#FFF1D6", "#8A5A00"],
            green: ["#E7F6EC", "#157F3D"],
            red: ["#FDECEA", "#B42318"],
            blue: ["#E9F1FB", "#1D4E89"],
            gray: ["#EFEDE9", "#6B625F"],
          };
          const t = tones[c.tone || "maroon"];
          return (
            '<div class="card stat-card p-4"><div class="flex items-start justify-between gap-2">' +
            '<div><div class="text-[11px] font-semibold uppercase tracking-wider text-muted">' +
            esc(c.label) +
            "</div>" +
            '<div class="font-serif text-2xl lg:text-[1.7rem] font-bold mt-1 leading-none">' +
            esc(String(c.value)) +
            "</div>" +
            (c.sub
              ? '<div class="text-xs text-muted mt-1.5">' + c.sub + "</div>"
              : "") +
            "</div>" +
            '<div class="stat-ic" style="background:' +
            t[0] +
            ";color:" +
            t[1] +
            '"><i data-lucide="' +
            (c.icon || "box") +
            '" class="w-5 h-5"></i></div></div></div>'
          );
        },

        pageHead(o) {
          const crumbs = UI.crumbs(o.title);
          const acts = (o.actions || [])
            .filter(
              (a) => a.minLevel === undefined || Session.atLeast(a.minLevel),
            )
            .map(
              (a) =>
                '<button class="btn ' +
                (a.cls || "btn-outline") +
                '" ' +
                (a.onclick ? 'onclick="' + a.onclick + '"' : "") +
                ' data-act="' +
                (a.id || "") +
                '"><i data-lucide="' +
                (a.icon || "plus") +
                '" class="w-4 h-4"></i>' +
                esc(a.label) +
                "</button>",
            )
            .join("");
          return (
            '<div class="mb-5">' +
            crumbs +
            '<div class="flex flex-col md:flex-row md:items-end justify-between gap-3">' +
            '<div><h1 class="font-serif text-2xl md:text-[1.7rem] font-bold">' +
            esc(o.title) +
            "</h1>" +
            (o.desc
              ? '<p class="text-sm text-muted mt-1 max-w-3xl">' +
                o.desc +
                "</p>"
              : "") +
            "</div>" +
            (acts
              ? '<div class="flex gap-2 flex-wrap">' + acts + "</div>"
              : "") +
            "</div></div>"
          );
        },
        crumbs(title) {
          const cur = flatNav().find((i) => i.label === title);
          return (
            '<div class="breadcrumb"><a onclick="location.hash=\'#/dashboard\'">Home</a><i data-lucide="chevron-right" class="w-3 h-3"></i><span>' +
            (cur ? esc(cur.group) : "Module") +
            '</span><i data-lucide="chevron-right" class="w-3 h-3"></i><span class="font-medium text-ink">' +
            esc(title) +
            "</span></div>"
          );
        },
        empty(msg, icon) {
          return (
            '<div class="empty"><i data-lucide="' +
            (icon || "inbox") +
            '"></i><p class="text-sm font-medium">' +
            esc(msg || "No records found") +
            '</p><p class="text-xs mt-1">Try adjusting your search or filters.</p></div>'
          );
        },

        renderTable(container, cfg) {
          const tid = "dt" + ++UI._dtc;
          const st = {
            q: "",
            page: 1,
            sortKey: cfg.sortKey || null,
            dir: cfg.sortDir || "asc",
            filters: {},
          };
          const ps = cfg.pageSize || UI.perPage();
          const wrap =
            typeof container === "string"
              ? document.querySelector(container)
              : container;
          function dataset() {
            let rows =
              typeof cfg.rows === "function"
                ? cfg.rows()
                : (cfg.rows || []).slice();
            if (cfg.deptScope !== false) {
              const d = Session.dept();
              if (d !== "all")
                rows = rows.filter((r) => (r.dept || r.libDept || "") === d);
            }
            Object.keys(st.filters).forEach(function (k) {
              if (st.filters[k])
                rows = rows.filter(
                  (r) => String(r[k]) === String(st.filters[k]),
                );
            });
            if (st.q) {
              const q = st.q.toLowerCase();
              rows = rows.filter((r) =>
                (cfg.searchKeys || []).some(
                  (k) =>
                    String(r[k] == null ? "" : r[k])
                      .toLowerCase()
                      .indexOf(q) >= 0,
                ),
              );
            }
            if (st.sortKey) {
              rows.sort(function (a, b) {
                let x = a[st.sortKey],
                  y = b[st.sortKey];
                if (typeof x === "number" && typeof y === "number")
                  return st.dir === "asc" ? x - y : y - x;
                x = String(x == null ? "" : x).toLowerCase();
                y = String(y == null ? "" : y).toLowerCase();
                return st.dir === "asc"
                  ? x.localeCompare(y)
                  : y.localeCompare(x);
              });
            }
            return rows;
          }
          function render() {
            const rows = dataset();
            const pages = Math.max(1, Math.ceil(rows.length / ps));
            if (st.page > pages) st.page = pages;
            const slice = rows.slice((st.page - 1) * ps, st.page * ps);
            let h = "";
            if (cfg.search !== false) {
              h +=
                '<div class="table-toolbar"><div class="relative flex-1 min-w-[180px] max-w-sm"><i data-lucide="search" class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"></i>' +
                '<input id="' +
                tid +
                '-q" class="input w-full !pl-8 !text-sm" placeholder="' +
                (cfg.searchPlaceholder || "Search…") +
                '" value="' +
                esc(st.q) +
                '"></div>';
              (cfg.filters || []).forEach(function (f, i) {
                h +=
                  '<select id="' +
                  tid +
                  "-f" +
                  i +
                  '" class="input !text-sm !py-1.5"><option value="">' +
                  esc(f.label) +
                  "</option>" +
                  f.options
                    .map(
                      (o) =>
                        '<option value="' +
                        esc(o.v !== undefined ? o.v : o) +
                        '" ' +
                        (String(st.filters[f.key]) ===
                        String(o.v !== undefined ? o.v : o)
                          ? "selected"
                          : "") +
                        ">" +
                        esc(o.l !== undefined ? o.l : o) +
                        "</option>",
                    )
                    .join("") +
                  "</select>";
              });
              if (cfg.toolbarExtra) h += cfg.toolbarExtra;
              h += "</div>";
            }
            h +=
              '<div class="overflow-x-auto"><table class="tbl w-full"><thead><tr>';
            (cfg.columns || []).forEach(function (c) {
              const sortable = c.sort !== false && c.key;
              h +=
                '<th class="' +
                (sortable ? "sortable" : "") +
                (c.cls ? " " + c.cls : "") +
                '" ' +
                (sortable ? 'data-sk="' + c.key + '"' : "") +
                ">" +
                esc(c.label) +
                (st.sortKey === c.key
                  ? ' <i data-lucide="arrow-' +
                    (st.dir === "asc" ? "up" : "down") +
                    '" class="w-3 h-3 inline"></i>'
                  : "") +
                "</th>";
            });
            if (cfg.actions && cfg.actions.length)
              h += '<th class="text-right">Actions</th>';
            h += "</tr></thead><tbody>";
            if (!slice.length) {
              h +=
                '<tr><td colspan="' +
                ((cfg.columns || []).length + (cfg.actions ? 1 : 0)) +
                '">' +
                UI.empty(cfg.emptyText, "search-x") +
                "</td></tr>";
            } else
              slice.forEach(function (r, ri) {
                h +=
                  '<tr class="' +
                  (cfg.onRow ? "clickable" : "") +
                  '" data-ri="' +
                  ri +
                  '">';
                (cfg.columns || []).forEach(function (c) {
                  const val = c.render ? c.render(r) : esc(r[c.key]);
                  h += '<td class="' + (c.cls || "") + '">' + val + "</td>";
                });
                if (cfg.actions && cfg.actions.length) {
                  h += '<td class="text-right whitespace-nowrap">';
                  cfg.actions.forEach(function (a, ai) {
                    if (a.show && !a.show(r)) return;
                    h +=
                      '<button class="tbl-act ' +
                      (a.danger ? "act-danger" : "") +
                      '" data-ai="' +
                      ai +
                      '" data-ri="' +
                      ri +
                      '" title="' +
                      esc(a.label) +
                      '"><i data-lucide="' +
                      a.icon +
                      '" class="w-4 h-4"></i></button>';
                  });
                  h += "</td>";
                }
                h += "</tr>";
              });
            h += "</tbody></table></div>";
            h +=
              '<div class="table-foot"><span>Showing ' +
              (rows.length ? (st.page - 1) * ps + 1 : 0) +
              "–" +
              Math.min(st.page * ps, rows.length) +
              " of " +
              rows.length +
              " records" +
              (Session.dept() !== "all"
                ? " · " + esc(deptName(Session.dept()))
                : "") +
              '</span><div class="flex gap-1 items-center">';
            h +=
              '<button class="pg-btn" data-pg="' +
              (st.page - 1) +
              '" ' +
              (st.page <= 1 ? "disabled" : "") +
              ">Prev</button>";
            for (let p = 1; p <= pages; p++) {
              if (
                pages > 7 &&
                Math.abs(p - st.page) > 2 &&
                p !== 1 &&
                p !== pages
              ) {
                if (Math.abs(p - st.page) === 3)
                  h += '<span class="px-1">…</span>';
                continue;
              }
              h +=
                '<button class="pg-btn ' +
                (p === st.page ? "active" : "") +
                '" data-pg="' +
                p +
                '">' +
                p +
                "</button>";
            }
            h +=
              '<button class="pg-btn" data-pg="' +
              (st.page + 1) +
              '" ' +
              (st.page >= pages ? "disabled" : "") +
              ">Next</button></div></div>";
            wrap.innerHTML = h;
            lucide.createIcons();
            const qi = wrap.querySelector("#" + tid + "-q");
            if (qi) {
              qi.addEventListener("input", function () {
                st.q = this.value;
                st.page = 1;
                render();
                const nq = wrap.querySelector("#" + tid + "-q");
                nq.focus();
                nq.setSelectionRange(nq.value.length, nq.value.length);
              });
            }
            (cfg.filters || []).forEach(function (f, i) {
              const s = wrap.querySelector("#" + tid + "-f" + i);
              if (s)
                s.addEventListener("change", function () {
                  st.filters[f.key] = this.value;
                  st.page = 1;
                  render();
                });
            });
            wrap.querySelectorAll("th.sortable").forEach(function (th) {
              th.addEventListener("click", function () {
                const k = this.dataset.sk;
                if (st.sortKey === k)
                  st.dir = st.dir === "asc" ? "desc" : "asc";
                else {
                  st.sortKey = k;
                  st.dir = "asc";
                }
                render();
              });
            });
            wrap.querySelectorAll("[data-pg]").forEach(function (b) {
              b.addEventListener("click", function () {
                st.page = Number(this.dataset.pg);
                render();
              });
            });
            wrap.querySelectorAll("[data-ai]").forEach(function (b) {
              b.addEventListener("click", function (e) {
                e.stopPropagation();
                const a = cfg.actions[Number(this.dataset.ai)];
                const r = slice[Number(this.dataset.ri)];
                if (a && r) a.onClick(r);
              });
            });
            if (cfg.onRow) {
              wrap.querySelectorAll("tbody tr[data-ri]").forEach(function (tr) {
                tr.addEventListener("click", function (e) {
                  if (e.target.closest("[data-ai]")) return;
                  cfg.onRow(slice[Number(this.dataset.ri)]);
                });
              });
            }
          }
          render();
          return { refresh: render, state: st };
        },

        chart(id, cfg) {
          const c = document.getElementById(id);
          if (!c || !window.Chart) return null;
          const ex = Chart.getChart(c);
          if (ex) ex.destroy();
          return new Chart(c, cfg);
        },

        exportCSV(name, rows, cols) {
          rows = rows || [];
          if (!rows.length) {
            UI.toast(
              "Nothing to export — no rows match current filters",
              "warning",
            );
            return;
          }
          const keys = cols || Object.keys(rows[0]);
          const cell = (v) => {
            v = v == null ? "" : String(v);
            return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
          };
          const csv = [
            keys.join(","),
            ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
          ].join("\n");
          UI.download(
            name + "_" + todayStr() + ".csv",
            "\uFEFF" + csv,
            "text/csv;charset=utf-8",
          );
          UI.toast(
            "Exported " + rows.length + " rows to " + name + ".csv",
            "success",
          );
        },
        download(fname, content, mime) {
          const b = new Blob([content], { type: mime || "text/plain" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          a.download = fname;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 800);
        },
        parseCSV(text) {
          const lines = text
            .replace(/\r/g, "")
            .split("\n")
            .filter((l) => l.trim() !== "");
          if (!lines.length) return { headers: [], rows: [] };
          const parseLine = (l) => {
            const out = [];
            let cur = "",
              q = false;
            for (let i = 0; i < l.length; i++) {
              const ch = l[i];
              if (q) {
                if (ch === '"') {
                  if (l[i + 1] === '"') {
                    cur += '"';
                    i++;
                  } else q = false;
                } else cur += ch;
              } else {
                if (ch === '"') q = true;
                else if (ch === ",") {
                  out.push(cur);
                  cur = "";
                } else cur += ch;
              }
            }
            out.push(cur);
            return out;
          };
          const headers = parseLine(lines[0]).map((h) => h.trim());
          const rows = lines.slice(1).map((l) => {
            const vals = parseLine(l);
            const o = {};
            headers.forEach(
              (h, i) => (o[h] = vals[i] !== undefined ? vals[i] : ""),
            );
            return o;
          });
          return { headers: headers, rows: rows };
        },

        bookCover(b, size) {
          const pal = [
            "#7D1519",
            "#2E080A",
            "#1F3A5F",
            "#274E37",
            "#5B2A4E",
            "#8A5A00",
            "#33424F",
            "#6B2D13",
          ];
          let h = 0;
          const t = b.title || "?";
          for (let i = 0; i < t.length; i++)
            h = (h * 31 + t.charCodeAt(i)) >>> 0;
          const col = pal[h % pal.length];
          const dims = {
            sm: "w-12 h-[4.4rem]",
            md: "w-[5.4rem] h-32",
            lg: "w-40 h-60",
          }[size || "md"];
          const cls = { sm: "", md: "bc-md", lg: "bc-lg" }[size || "md"];
          return (
            '<div class="book-cover ' +
            cls +
            " " +
            dims +
            '" style="background:linear-gradient(155deg,' +
            col +
            ',rgba(0,0,0,.62))">' +
            '<div class="bc-title">' +
            esc(trunc(b.title, size === "lg" ? 60 : 34)) +
            '</div><div class="bc-author">' +
            esc(trunc(b.author, size === "lg" ? 34 : 20)) +
            "</div></div>"
          );
        },

        withLoading(el, fn) {
          el.innerHTML =
            '<div class="space-y-4"><div class="skeleton h-9 w-64"></div><div class="grid grid-cols-2 md:grid-cols-4 gap-4">' +
            Array(4).fill('<div class="skeleton h-24"></div>').join("") +
            '</div><div class="skeleton h-64"></div></div>';
          setTimeout(function () {
            fn(el);
            lucide.createIcons();
          }, 220);
        },
      };

      /* shared record modals */
      function openBookModal(bookId, opts) {
        opts = opts || {};
        const b = bookById(bookId);
        if (!b) {
          UI.toast("Book not found", "error");
          return;
        }
        const loans = DB.get("loans").filter((l) => l.bookId === bookId);
        const out = loans.filter((l) => loanStatus(l) !== "returned").length;
        const avail = b.copies - out;
        const rel = DB.get("books")
          .filter((x) => x.id !== b.id && x.subject === b.subject)
          .slice(0, 4);
        const body =
          '<div class="flex flex-col sm:flex-row gap-5">' +
          '<div class="flex-shrink-0 mx-auto sm:mx-0">' +
          UI.bookCover(b, "lg") +
          "</div>" +
          '<div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap mb-1">' +
          UI.deptBadge(b.dept) +
          UI.statusBadge(avail > 0 ? "active" : "overdue")
            .replace("active", "available")
            .replace("overdue", "missing") +
          "</div>" +
          '<h3 class="font-serif text-xl font-bold leading-snug">' +
          esc(b.title) +
          "</h3>" +
          '<p class="text-sm text-muted">by ' +
          esc(b.author) +
          " · " +
          esc(b.publisher) +
          ", " +
          b.year +
          "</p>" +
          '<div class="meta-grid mt-4">' +
          '<div><div class="mk">Call number</div><div class="mv">' +
          esc(b.callNo) +
          "</div></div>" +
          '<div><div class="mk">ISBN</div><div class="mv">' +
          esc(b.isbn) +
          "</div></div>" +
          '<div><div class="mk">Subject</div><div class="mv">' +
          esc(b.subject) +
          "</div></div>" +
          '<div><div class="mk">Shelf location</div><div class="mv">' +
          esc(b.shelf) +
          "</div></div>" +
          '<div><div class="mk">Copies</div><div class="mv">' +
          b.copies +
          ' total · <span class="' +
          (avail > 0 ? "text-green-700" : "text-red-700") +
          ' font-semibold">' +
          avail +
          " available</span></div></div>" +
          '<div><div class="mk">Record source</div><div class="mv"><span class="sim-tag">Prototype local</span></div></div>' +
          "</div>" +
          '<p class="text-[11px] text-muted mt-3 inline-flex items-center gap-1"><i data-lucide="info" class="w-3.5 h-3.5"></i> In production this record will be read from Koha ILS (authoritative catalog). Shown here as simulated data.</p>' +
          "</div></div>" +
          (rel.length
            ? '<div class="mt-6"><div class="label">Related books in ' +
              esc(b.subject) +
              '</div><div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
              rel
                .map(
                  (r) =>
                    '<button class="text-left card p-2.5 hover:border-maroon/40 transition" data-rel="' +
                    r.id +
                    '">' +
                    UI.bookCover(r, "sm") +
                    '<div class="text-[11px] font-semibold mt-1.5 leading-tight">' +
                    esc(trunc(r.title, 40)) +
                    "</div></button>",
                )
                .join("") +
              "</div></div>"
            : "");
        const isStudent = opts.studentMode || Session.role() === "student";
        let footer = "";
        if (isStudent) {
          footer =
            '<button class="btn btn-outline" data-close>Close</button><button class="btn btn-gold" data-reserve><i data-lucide="bookmark" class="w-4 h-4"></i> ' +
            (avail > 0 ? "Reserve a copy" : "Join reservation queue") +
            "</button>";
        } else {
          footer =
            '<button class="btn btn-outline" data-close>Close</button>' +
            (Session.atLeast(2)
              ? '<button class="btn btn-outline" data-catalogue><i data-lucide="pen-line" class="w-4 h-4"></i> Cataloguing record</button>'
              : "") +
            '<button class="btn btn-primary" data-reserve><i data-lucide="bookmark-plus" class="w-4 h-4"></i> Reserve for patron</button>';
        }
        const m = UI.modal({
          title: "Book details",
          subtitle: b.id + " · Dewey " + b.dewey,
          size: "lg",
          body: body,
          footer: footer,
        });
        m.el.querySelector("[data-close]").onclick = m.close;
        m.el.querySelectorAll("[data-rel]").forEach(
          (x) =>
            (x.onclick = function () {
              m.close();
              openBookModal(this.dataset.rel, opts);
            }),
        );
        const catBtn = m.el.querySelector("[data-catalogue]");
        if (catBtn)
          catBtn.onclick = function () {
            m.close();
            sessionStorage.setItem("cataloguingFocus", b.id);
            location.hash = "#/cataloguing";
          };
        m.el.querySelector("[data-reserve]").onclick = function () {
          if (isStudent) {
            SP_reserveForSelf(b.id, m.close);
            return;
          }
          m.close();
          reserveForPatron(b.id);
        };
        lucide.createIcons();
      }
      function reserveForPatron(bookId) {
        const b = bookById(bookId);
        const pats = DB.get("patrons").filter(
          (p) => p.dept === b.dept || Session.dept() === "all",
        );
        UI.formModal({
          title: "Reserve “" + trunc(b.title, 44) + "”",
          subtitle: "Create a hold for a patron",
          icon: "bookmark-plus",
          fields: [
            {
              name: "patronId",
              label: "Patron",
              type: "select",
              required: true,
              span: 2,
              placeholder: "Select a patron…",
              options: pats.map((p) => ({
                v: p.id,
                l: p.name + " — " + p.no + " (" + p.type + ")",
              })),
            },
            {
              name: "note",
              label: "Note (optional)",
              type: "textarea",
              span: 2,
            },
          ],
          onSubmit: function (v, close) {
            const dup = DB.get("reservations").find(
              (r) =>
                r.bookId === bookId &&
                r.patronId === v.patronId &&
                ["pending", "approved", "ready"].includes(r.status),
            );
            if (dup) {
              UI.toast(
                patronName(v.patronId) +
                  " already has an active reservation for this title",
                "error",
              );
              return;
            }
            DB.add("reservations", {
              id: uid("RSV"),
              bookId: bookId,
              patronId: v.patronId,
              dept: b.dept,
              date: todayStr(),
              status: "pending",
              note: v.note || "",
            });
            logActivity(
              "Reservation placed on " +
                trunc(b.title, 40) +
                " for " +
                patronName(v.patronId),
              "reservation",
            );
            DB.audit(
              "Create",
              "Reservations",
              "Hold on " + bookId + " for " + v.patronId,
            );
            close();
            UI.toast("Reservation created — patron is in the queue", "success");
            if (window.App && App.rerender) App.rerender();
          },
        });
      }
      function openPatronDrawer(patronId) {
        const p = patronById(patronId);
        if (!p) {
          UI.toast("Patron not found", "error");
          return;
        }
        const loans = DB.get("loans").filter((l) => l.patronId === patronId);
        const act = loans.filter((l) => loanStatus(l) !== "returned");
        const res = DB.get("reservations").filter(
          (r) =>
            r.patronId === patronId &&
            ["pending", "approved", "ready"].includes(r.status),
        );
        const outstanding = patronOutstanding(patronId);
        const body =
          '<div class="flex items-center gap-4 mb-5"><span class="avatar avatar-lg">' +
          initials(p.name) +
          "</span>" +
          '<div><div class="font-serif text-lg font-bold">' +
          esc(p.name) +
          '</div><div class="text-sm text-muted">' +
          esc(p.program) +
          " · " +
          esc(p.year) +
          "</div>" +
          '<div class="flex gap-1.5 mt-1.5 flex-wrap">' +
          UI.badge(p.type, "maroon") +
          UI.statusBadge(p.status) +
          UI.deptBadge(p.dept) +
          "</div></div></div>" +
          '<div class="grid grid-cols-3 gap-3 mb-5">' +
          '<div class="card p-3 text-center"><div class="font-serif text-xl font-bold">' +
          act.length +
          '</div><div class="text-[11px] text-muted uppercase tracking-wide">On loan</div></div>' +
          '<div class="card p-3 text-center"><div class="font-serif text-xl font-bold">' +
          res.length +
          '</div><div class="text-[11px] text-muted uppercase tracking-wide">Reservations</div></div>' +
          '<div class="card p-3 text-center"><div class="font-serif text-xl font-bold ' +
          (outstanding > 0 ? "text-red-700" : "text-green-700") +
          '">' +
          money(outstanding) +
          '</div><div class="text-[11px] text-muted uppercase tracking-wide">Fines due</div></div></div>' +
          '<div class="meta-grid mb-5 card p-4">' +
          '<div><div class="mk">Patron ID</div><div class="mv">' +
          p.id +
          "</div></div>" +
          '<div><div class="mk">' +
          (p.type === "student" ? "Student number" : "ID number") +
          '</div><div class="mv">' +
          esc(p.no) +
          "</div></div>" +
          '<div><div class="mk">Email</div><div class="mv break-all">' +
          esc(p.email) +
          "</div></div>" +
          '<div><div class="mk">Phone</div><div class="mv">' +
          esc(p.phone) +
          "</div></div>" +
          '<div><div class="mk">Member since</div><div class="mv">' +
          fmtDate(p.joined) +
          "</div></div>" +
          '<div><div class="mk">Portal access</div><div class="mv">' +
          (p.portalAccess === false
            ? UI.badge("disabled", "red")
            : UI.badge("enabled", "green")) +
          "</div></div></div>" +
          '<div class="label">Borrowing history (' +
          loans.length +
          ")</div>" +
          (loans.length
            ? '<div class="overflow-x-auto"><table class="tbl w-full"><thead><tr><th>Title</th><th>Due</th><th>Status</th></tr></thead><tbody>' +
              loans
                .slice(0, 8)
                .map(
                  (l) =>
                    '<tr><td class="max-w-[180px] truncate">' +
                    esc(trunc(bookTitle(l.bookId), 38)) +
                    '</td><td class="whitespace-nowrap">' +
                    fmtDate(l.due) +
                    "</td><td>" +
                    UI.statusBadge(loanStatus(l)) +
                    "</td></tr>",
                )
                .join("") +
              "</tbody></table></div>"
            : '<p class="text-sm text-muted">No borrowing history yet.</p>');
        UI.drawer({
          kicker: "Patron profile",
          title: esc(p.name),
          subtitle: p.id + " · " + deptName(p.dept),
          body: body,
          footer:
            '<button class="btn btn-outline" data-view-loans><i data-lucide="repeat" class="w-4 h-4"></i> View in circulation</button>',
        });
        const vl = document.querySelector("#drawer-root [data-view-loans]");
        if (vl)
          vl.onclick = function () {
            document.getElementById("drawer-root").innerHTML = "";
            location.hash = "#/circulation";
            sessionStorage.setItem("circPatron", patronId);
          };
      }
      function patronOutstanding(pid) {
        const S = settings();
        let total = 0;
        DB.get("loans").forEach(function (l) {
          if (l.patronId !== pid) return;
          const late = daysLate(l.due, l.returned || todayStr());
          const amt = l.returned
            ? l.fineAssessed || late * S.finePerDay
            : late * S.finePerDay;
          if (amt > 0) total += Math.max(0, amt - paidFor(l.id));
        });
        DB.get("fines").forEach(function (f) {
          if (f.patronId === pid)
            total += Math.max(0, f.amount - paidFor(f.id));
        });
        return total;
      }

      /* =============== Admin shell =============== */
      const App = {
        current: null,
        init() {
          if (!document.getElementById("app-shell")) return;
          Seed.init();
          if (!Auth.requireStaff()) return;
          if (window.Chart) {
            Chart.defaults.font.family = "Inter, sans-serif";
            Chart.defaults.color = "#6B625F";
            Chart.defaults.borderColor = "#EEE8DE";
          }
          App.renderSidebar();
          App.renderTopbar();
          window.addEventListener("hashchange", App.route);
          App.route();
          document.addEventListener("click", function (e) {
            if (!e.target.closest(".relative")) {
              document
                .querySelectorAll(".dropdown-menu")
                .forEach((d) => d.classList.add("hidden"));
              const sr = document.querySelector(".search-results");
              if (sr) sr.remove();
            }
          });
        },
        rerender() {
          App.route(true);
        },
        navOpen() {
          return Store.get("navOpen", {
            Overview: true,
            "Library Operations": true,
            Collections: false,
            "Patron Services": false,
            Administration: false,
          });
        },
        renderSidebar() {
          const u = Session.user();
          const open = App.navOpen();
          const unread = DB.get("notifications").filter((n) => !n.read).length;
          let h =
            '<div class="sidebar-brand"><svg viewBox="0 0 64 72" class="w-9 h-9 flex-shrink-0"><path d="M32 2 L60 10 V34 C60 52 48 64 32 70 C16 64 4 52 4 34 V10 Z" fill="#7D1519" stroke="#FAA61A" stroke-width="3"/><path d="M14 27 h16 v21 c-6-3-11-3-16 0 z" fill="#FAF7F1"/><path d="M50 27 H34 v21 c6-3 11-3 16 0 z" fill="#FFD25E"/><path d="M32 10 l2.4 5 5.5 .7-4 3.9 1 5.5-4.9-2.6-4.9 2.6 1-5.5-4-3.9 5.5-.7z" fill="#FAA61A"/></svg>' +
            '<div class="leading-tight"><div class="font-serif font-bold text-[15px] text-warm">USANT Library</div><div class="text-[10px] uppercase tracking-[0.18em] text-gold-light/80">Management System</div></div>' +
            '<button class="icon-btn !text-warm/70 lg:hidden ml-auto" id="sb-close"><i data-lucide="x" class="w-5 h-5"></i></button></div><nav class="sidebar-nav">';
          NAV.forEach(function (g) {
            const items = g.items.filter(
              (i) => i.minLevel === undefined || Session.atLeast(i.minLevel),
            );
            if (!items.length) return;
            h +=
              '<div class="nav-group ' +
              (open[g.group] ? "" : "collapsed") +
              '" data-group="' +
              g.group +
              '">' +
              '<button class="nav-group-label">' +
              esc(g.group) +
              '<i data-lucide="chevron-down" class="chev w-3.5 h-3.5"></i></button><div class="nav-group-items">';
            items.forEach(function (i) {
              h +=
                '<a class="nav-item" href="#/' +
                i.id +
                '" data-nav="' +
                i.id +
                '"><i data-lucide="' +
                i.icon +
                '" class="w-[17px] h-[17px] flex-shrink-0"></i><span>' +
                esc(i.label) +
                "</span>" +
                (i.id === "notifications" && unread
                  ? '<span class="nav-badge">' + unread + "</span>"
                  : "") +
                "</a>";
            });
            h += "</div></div>";
          });
          h +=
            '</nav><div class="sidebar-foot"><div class="flex items-center gap-2.5"><span class="avatar">' +
            initials(u.name) +
            "</span>" +
            '<div class="min-w-0 flex-1"><div class="text-[13px] font-semibold truncate">' +
            esc(u.name) +
            '</div><div class="text-[11px] text-warm/60 truncate">' +
            (ROLES.find((r) => r.id === u.role) || {}).label +
            "</div></div>" +
            '<button class="icon-btn !text-warm/70 hover:!bg-white/10" id="sb-logout" title="Log out"><i data-lucide="log-out" class="w-4 h-4"></i></button></div></div>';
          const sb = document.getElementById("sidebar");
          sb.innerHTML = h;
          lucide.createIcons();
          sb.querySelectorAll(".nav-group-label").forEach(function (b) {
            b.onclick = function () {
              const g = b.parentElement;
              g.classList.toggle("collapsed");
              const o = App.navOpen();
              o[g.dataset.group] = !g.classList.contains("collapsed");
              Store.set("navOpen", o);
            };
          });
          document.getElementById("sb-logout").onclick = function () {
            UI.confirm({
              title: "Log out",
              message:
                "End this simulated session and return to the login page?",
              confirmText: "Log out",
              onConfirm: Auth.logout,
            });
          };
          document.getElementById("sb-close").onclick = function () {
            sb.classList.remove("open");
            document.getElementById("sidebar-overlay").classList.remove("show");
          };
          document.getElementById("sidebar-overlay").onclick = function () {
            sb.classList.remove("open");
            this.classList.remove("show");
          };
        },
        renderTopbar() {
          const canAll = Session.atLeast(4);
          let opts = "";
          if (canAll)
            opts +=
              '<option value="all" ' +
              (Session.dept() === "all" ? "selected" : "") +
              ">All departments</option>";
          DEPARTMENTS.forEach(function (d) {
            opts +=
              '<option value="' +
              d.id +
              '" ' +
              (Session.dept() === d.id ? "selected" : "") +
              ">" +
              esc(d.name) +
              "</option>";
          });
          const h =
            '<button class="icon-btn lg:hidden" id="tb-menu"><i data-lucide="menu" class="w-5 h-5"></i></button>' +
            '<div class="hidden md:flex items-center gap-2 pr-3 border-r border-ink/10"><i data-lucide="building-2" class="w-4 h-4 text-maroon"></i>' +
            '<select id="dept-select" class="input !py-1.5 !text-[13px] font-medium !border-maroon/25 !bg-warm">' +
            opts +
            "</select></div>" +
            '<div class="topbar-search hidden sm:block"><i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"></i>' +
            '<input id="global-search" class="input w-full !pl-9 !text-sm" placeholder="Search books, patrons, records…"></div>' +
            '<div class="ml-auto flex items-center gap-1">' +
            '<span class="hidden xl:flex items-center gap-1.5 text-xs text-muted mr-2"><i data-lucide="calendar-days" class="w-4 h-4"></i>' +
            fmtDateLong(todayStr()) +
            "</span>" +
            '<button class="icon-btn" id="tb-help" title="Help"><i data-lucide="help-circle" class="w-5 h-5"></i></button>' +
            '<div class="relative"><button class="icon-btn relative" id="tb-bell" title="Notifications"><i data-lucide="bell" class="w-5 h-5"></i>' +
            '<span id="tb-bell-count" class="hidden absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gold text-maroon-dark text-[10px] font-bold flex items-center justify-center"></span></div>' +
            '<div id="tb-bell-menu" class="dropdown-menu hidden" style="width:340px"></div></div>' +
            '<div class="relative"><button class="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-warm" id="tb-user">' +
            '<span class="avatar avatar-sm">' +
            initials(Session.user().name) +
            '</span><i data-lucide="chevron-down" class="w-4 h-4 text-muted"></i></button>' +
            '<div id="tb-user-menu" class="dropdown-menu hidden">' +
            '<div class="dropdown-head"><div class="font-semibold text-sm">' +
            esc(Session.user().name) +
            '</div><div class="text-xs text-muted">' +
            (ROLES.find((r) => r.id === Session.role()) || {}).label +
            " · " +
            esc(Session.user().email) +
            "</div></div>" +
            '<button class="dropdown-item" data-mi="profile"><i data-lucide="user-round" class="w-4 h-4"></i> My profile</button>' +
            '<button class="dropdown-item" data-mi="switch"><i data-lucide="repeat-2" class="w-4 h-4"></i> Switch role (demo)</button>' +
            "<a class=\"dropdown-item\" href=\"#\" onclick=\"Proto.screen('student');return false;\"><i data-lucide=\"graduation-cap\" class=\"w-4 h-4\"></i> Open Student Portal</a>" +
            '<button class="dropdown-item" data-mi="reset"><i data-lucide="rotate-ccw" class="w-4 h-4"></i> Reset demo data</button>' +
            '<div class="border-t border-ink/10 my-1"></div>' +
            '<button class="dropdown-item danger" data-mi="logout"><i data-lucide="log-out" class="w-4 h-4"></i> Log out</button></div></div></div>';
          const tb = document.getElementById("topbar");
          tb.innerHTML = h;
          lucide.createIcons();
          document.getElementById("tb-menu").onclick = function () {
            document.getElementById("sidebar").classList.add("open");
            document.getElementById("sidebar-overlay").classList.add("show");
          };
          document.getElementById("dept-select").onchange = function () {
            Session.setDept(this.value);
            DB.audit(
              "Filter",
              "Dashboard",
              "Department scope changed to " + deptName(this.value),
            );
            UI.toast("Viewing: " + deptName(this.value), "info");
            App.rerender();
          };
          document.getElementById("tb-help").onclick = App.help;
          document.getElementById("tb-bell").onclick = function (e) {
            e.stopPropagation();
            App.bellMenu();
          };
          document.getElementById("tb-user").onclick = function (e) {
            e.stopPropagation();
            const m = document.getElementById("tb-user-menu");
            m.classList.toggle("hidden");
          };
          document
            .querySelectorAll("#tb-user-menu [data-mi]")
            .forEach(function (b) {
              b.onclick = function () {
                document.getElementById("tb-user-menu").classList.add("hidden");
                App.menuAction(this.dataset.mi);
              };
            });
          App.updateBellCount();
          const gs = document.getElementById("global-search");
          let deb;
          gs.addEventListener("input", function () {
            clearTimeout(deb);
            const v = this.value;
            deb = setTimeout(() => App.globalSearch(v), 220);
          });
          gs.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
              sessionStorage.setItem("catalogQuery", this.value);
              location.hash = "#/catalog";
              const sr = document.querySelector(".search-results");
              if (sr) sr.remove();
            }
          });
        },
        updateBellCount() {
          const n = DB.get("notifications").filter((x) => !x.read).length;
          const el = document.getElementById("tb-bell-count");
          if (!el) return;
          if (n) {
            el.textContent = n > 9 ? "9+" : n;
            el.classList.remove("hidden");
          } else el.classList.add("hidden");
        },
        bellMenu() {
          const m = document.getElementById("tb-bell-menu");
          if (!m.classList.contains("hidden")) {
            m.classList.add("hidden");
            return;
          }
          const notes = DB.get("notifications").slice(0, 6);
          m.innerHTML =
            '<div class="dropdown-head flex justify-between items-center"><span class="font-semibold text-sm">Notifications</span><button class="text-xs text-maroon font-medium" id="bell-all">Mark all read</button></div>' +
            notes
              .map(function (n) {
                return (
                  '<button class="dropdown-item !items-start" data-nid="' +
                  n.id +
                  '"><span class="mt-0.5 ' +
                  (n.read ? "text-muted" : "text-gold") +
                  '"><i data-lucide="' +
                  (n.read ? "circle" : "circle-dot") +
                  '" class="w-3.5 h-3.5"></i></span><span class="min-w-0"><span class="block text-[13px] font-medium truncate">' +
                  esc(n.title) +
                  '</span><span class="block text-[11px] text-muted">' +
                  timeAgo(n.date + " 08:00") +
                  " · " +
                  esc(n.type) +
                  "</span></span></button>"
                );
              })
              .join("") +
            '<a class="dropdown-item justify-center text-maroon font-medium text-xs border-t border-ink/10 mt-1 pt-2" href="#/notifications">View all notifications</a>';
          m.classList.remove("hidden");
          lucide.createIcons();
          m.onclick = function (e) {
            e.stopPropagation();
          };
          document.getElementById("bell-all").onclick = function () {
            const a = DB.get("notifications");
            a.forEach((n) => (n.read = true));
            DB.set("notifications", a);
            m.classList.add("hidden");
            App.updateBellCount();
            App.renderSidebar();
            UI.toast("All notifications marked as read", "success");
          };
          m.querySelectorAll("[data-nid]").forEach(function (b) {
            b.onclick = function () {
              const a = DB.get("notifications");
              const n = a.find((x) => x.id === this.dataset.nid);
              if (n) n.read = true;
              DB.set("notifications", a);
              m.classList.add("hidden");
              App.updateBellCount();
              App.renderSidebar();
              UI.toast("Marked as read: " + n.title, "info");
            };
          });
        },
        menuAction(act) {
          const u = Session.user();
          if (act === "logout") {
            UI.confirm({
              title: "Log out",
              message: "End this simulated session?",
              confirmText: "Log out",
              onConfirm: Auth.logout,
            });
          } else if (act === "reset") {
            UI.confirm({
              title: "Reset demo data",
              message:
                "This restores all books, patrons, loans and settings to their original seeded state. Local changes will be lost.",
              confirmText: "Reset everything",
              onConfirm: function () {
                Seed.reset();
                location.reload();
              },
            });
          } else if (act === "switch") {
            const users = DB.get("users");
            UI.modal({
              title: "Switch role (demo)",
              subtitle:
                "Explore the system from different perspectives — simulated sign-in, no password needed.",
              size: "md",
              body:
                '<div class="space-y-2">' +
                users
                  .map(
                    (x) =>
                      '<button class="demo-btn" data-uid="' +
                      x.id +
                      '" ' +
                      (x.id === u.id ? 'style="border-color:#7D1519"' : "") +
                      '><span class="demo-ic"><i data-lucide="' +
                      (x.role === "student" ? "graduation-cap" : "shield") +
                      '" class="w-4 h-4"></i></span><span><span class="block text-sm font-semibold">' +
                      esc(x.name) +
                      '</span><span class="block text-[11px] text-muted">' +
                      (ROLES.find((r) => r.id === x.role) || {}).label +
                      " · " +
                      esc(
                        x.dept === "all" ? "all departments" : deptName(x.dept),
                      ) +
                      "</span></span>" +
                      (x.id === u.id
                        ? '<span class="ml-auto badge badge-maroon">current</span>'
                        : "") +
                      "</button>",
                  )
                  .join("") +
                "</div>",
              onOpen: function (root, close) {
                root.querySelectorAll("[data-uid]").forEach(function (b) {
                  b.onclick = function () {
                    const id = b.dataset.uid;
                    Session.set({
                      userId: id,
                      dept:
                        (DB.get("users").find((x) => x.id === id) || {}).dept ||
                        "all",
                      loginAt: nowStr(),
                    });
                    close();
                    UI.toast(
                      "Switched to " +
                        (DB.get("users").find((x) => x.id === id) || {}).name,
                      "success",
                    );
                    setTimeout(() => location.reload(), 500);
                  };
                });
              },
            });
          } else if (act === "profile") {
            UI.formModal({
              title: "My profile",
              subtitle: "Simulated profile management",
              icon: "user-round",
              values: u,
              fields: [
                { name: "name", label: "Full name", required: true },
                {
                  name: "email",
                  label: "Email",
                  type: "email",
                  required: true,
                },
                { name: "phone", label: "Phone number" },
                {
                  name: "role",
                  label: "Role",
                  type: "static",
                  value: (ROLES.find((r) => r.id === u.role) || {}).label,
                },
                {
                  name: "dept",
                  label: "Department",
                  type: "static",
                  value:
                    u.dept === "all" ? "All departments" : deptName(u.dept),
                },
                {
                  name: "pw",
                  label: "New password (simulated)",
                  type: "password",
                  placeholder: "Leave blank to keep current",
                  span: 2,
                },
              ],
              onSubmit: function (v, close) {
                if (v.pw && v.pw.length < 6) {
                  UI.toast("Password must be at least 6 characters", "error");
                  return;
                }
                DB.update("users", u.id, {
                  name: v.name,
                  email: v.email,
                  phone: v.phone,
                  password: v.pw || u.password,
                });
                DB.audit("Update", "Authentication", "Profile updated");
                close();
                UI.toast("Profile updated (simulated)", "success");
                App.renderSidebar();
                App.renderTopbar();
              },
            });
          }
        },
        help() {
          UI.modal({
            title: "Prototype help",
            subtitle:
              "USANT University Library Management System — frontend demo",
            size: "md",
            body:
              '<div class="space-y-3 text-sm text-ink/85">' +
              "<p><strong>What this is:</strong> an interactive UI prototype. Every record you see is fictional sample data stored in your browser (localStorage). Nothing is sent anywhere and no real Koha ILS connection exists.</p>" +
              '<div class="card p-3 bg-warm"><div class="font-semibold text-maroon mb-1.5 flex items-center gap-1.5"><i data-lucide="key-round" class="w-4 h-4"></i> Demo accounts (password: <code class="chip-code">usant123</code>)</div>' +
              '<ul class="text-xs space-y-1 text-muted">' +
              DB.get("users")
                .map(
                  (u) =>
                    '<li><span class="font-mono">' +
                    esc(u.email) +
                    "</span> — " +
                    (ROLES.find((r) => r.id === u.role) || {}).label +
                    "</li>",
                )
                .join("") +
              "</ul></div>" +
              "<p><strong>Try this:</strong> switch departments in the top bar, check a book out in Circulation, record a fine payment and print the receipt, run a report and export CSV, or switch to the Student Portal from your profile menu.</p>" +
              "<p><strong>Reset:</strong> Profile menu → “Reset demo data” restores the original seed.</p></div>",
            footer:
              "<button class=\"btn btn-primary\" onclick=\"document.getElementById('modal-root').innerHTML=''\">Got it</button>",
          });
        },
        globalSearch(q) {
          const old = document.querySelector(".search-results");
          if (old) old.remove();
          q = (q || "").trim().toLowerCase();
          if (q.length < 2) return;
          const wrap = document.querySelector(".topbar-search");
          let books = DB.get("books")
            .filter((b) =>
              (
                b.title +
                " " +
                b.author +
                " " +
                b.isbn +
                " " +
                b.subject +
                " " +
                b.callNo
              )
                .toLowerCase()
                .includes(q),
            )
            .slice(0, 5);
          let pats = DB.get("patrons")
            .filter((p) =>
              (p.name + " " + p.no + " " + p.program + " " + p.email)
                .toLowerCase()
                .includes(q),
            )
            .slice(0, 4);
          if (!books.length && !pats.length) {
            wrap.insertAdjacentHTML(
              "beforeend",
              '<div class="search-results"><div class="p-4 text-center text-sm text-muted">No matches for “' +
                esc(q) +
                "”</div></div>",
            );
            return;
          }
          let h = '<div class="search-results">';
          if (books.length) {
            h +=
              '<div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Books</div>';
            books.forEach((b) => {
              h +=
                '<button class="search-res-item" data-book="' +
                b.id +
                '">' +
                UI.bookCover(b, "sm") +
                '<span class="min-w-0"><span class="block text-[13px] font-semibold truncate">' +
                esc(b.title) +
                '</span><span class="block text-[11px] text-muted">' +
                esc(b.author) +
                " · " +
                b.callNo +
                '</span></span><span class="ml-auto">' +
                UI.deptBadge(b.dept) +
                "</span></button>";
            });
          }
          if (pats.length) {
            h +=
              '<div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Patrons</div>';
            pats.forEach((p) => {
              h +=
                '<button class="search-res-item" data-patron="' +
                p.id +
                '"><span class="avatar avatar-sm">' +
                initials(p.name) +
                '</span><span class="min-w-0"><span class="block text-[13px] font-semibold truncate">' +
                esc(p.name) +
                '</span><span class="block text-[11px] text-muted">' +
                esc(p.no) +
                " · " +
                esc(p.program) +
                "</span></button>";
            });
          }
          h +=
            '<button class="search-res-item justify-center text-xs text-maroon font-semibold border-t border-ink/10" data-all>See all catalog results for “' +
            esc(q) +
            "”</button></div>";
          wrap.insertAdjacentHTML("beforeend", h);
          lucide.createIcons();
          const sr = wrap.querySelector(".search-results");
          sr.addEventListener("click", function (e) {
            e.stopPropagation();
          });
          sr.querySelectorAll("[data-book]").forEach(
            (b) =>
              (b.onclick = function () {
                sr.remove();
                openBookModal(this.dataset.book);
              }),
          );
          sr.querySelectorAll("[data-patron]").forEach(
            (b) =>
              (b.onclick = function () {
                sr.remove();
                openPatronDrawer(this.dataset.patron);
              }),
          );
          sr.querySelector("[data-all]").onclick = function () {
            sessionStorage.setItem("catalogQuery", q);
            location.hash = "#/catalog";
            sr.remove();
          };
        },
        route(force) {
          if (Proto.active !== "admin") return;
          if (!document.getElementById("app-shell")) return;
          const id = location.hash.replace(/^#\/?/, "") || "dashboard";
          const item = flatNav().find((i) => i.id === id);
          const view = document.getElementById("view");
          UI.clearTimers();
          document.getElementById("sidebar").classList.remove("open");
          document.getElementById("sidebar-overlay").classList.remove("show");
          document
            .querySelectorAll(".nav-item")
            .forEach((a) => a.classList.toggle("active", a.dataset.nav === id));
          App.current = id;
          if (window.scrollTo) window.scrollTo(0, 0);
          if (!item || !Modules[id]) {
            view.innerHTML =
              UI.pageHead({ title: "Page not found" }) +
              '<div class="card p-10 text-center"><i data-lucide="compass" class="w-10 h-10 mx-auto text-muted mb-3"></i><p class="font-serif text-lg font-bold">This module does not exist</p><p class="text-sm text-muted mt-1">Use the sidebar to navigate, or return to the <a class="text-maroon font-semibold cursor-pointer" onclick="location.hash=\'#/dashboard\'">Dashboard</a>.</p></div>';
            lucide.createIcons();
            return;
          }
          if (item.minLevel !== undefined && !Session.atLeast(item.minLevel)) {
            view.innerHTML =
              UI.pageHead({ title: item.label }) +
              '<div class="card p-10 text-center"><i data-lucide="lock" class="w-10 h-10 mx-auto text-maroon mb-3"></i><p class="font-serif text-lg font-bold">Access restricted</p><p class="text-sm text-muted mt-1 max-w-md mx-auto">Your simulated role (' +
              (ROLES.find((r) => r.id === Session.role()) || {}).label +
              ") does not have permission for this module. Use “Switch role (demo)” in the profile menu to explore other interfaces.</p></div>";
            lucide.createIcons();
            return;
          }
          view.innerHTML =
            '<div class="space-y-4"><div class="skeleton h-9 w-72"></div><div class="skeleton h-56"></div></div>';
          setTimeout(
            function () {
              try {
                Modules[id](view);
              } catch (err) {
                console.error(err);
                view.innerHTML =
                  UI.pageHead({ title: item.label }) +
                  '<div class="card p-8 text-center text-sm text-red-700">Rendering error in prototype module: ' +
                  esc(err.message) +
                  "</div>";
              }
              lucide.createIcons();
            },
            force ? 0 : 180,
          );
        },
      };

      /* FILE: js/modules/catalog.js — Catalog, Cataloguing, Serials, Documents, Inventory, Acquisitions */
      (function () {
        function deptOpts() {
          return DEPARTMENTS.map((d) => ({ v: d.id, l: d.name }));
        }
        function subjOpts() {
          return [...new Set(DB.get("books").map((b) => b.subject))]
            .sort()
            .map((s) => ({ v: s, l: s }));
        }

        /* ---------- Module 4: Catalog Search & Discovery ---------- */
        Modules.catalog = function (el) {
          const q0 = sessionStorage.getItem("catalogQuery") || "";
          sessionStorage.removeItem("catalogQuery");
          const st = {
            q: q0,
            avail: "",
            subject: "",
            sort: "popularity",
            page: 1,
            per: 12,
          };
          el.innerHTML =
            UI.pageHead({
              title: "Catalog Search & Discovery",
              desc: "Search the combined university collection by title, author, ISBN, subject or call number. Prototype catalog — in production, records are served by Koha ILS.",
              actions: [
                {
                  label: "Open Cataloguing",
                  icon: "book-plus",
                  cls: "btn-primary",
                  minLevel: 2,
                  onclick: "location.hash='#/cataloguing'",
                },
              ],
            }) +
            '<div class="card p-4 mb-5"><div class="flex flex-col lg:flex-row gap-3">' +
            '<div class="relative flex-1"><i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted"></i><input id="cat-q" class="input w-full !pl-9" placeholder="Search by title, author, ISBN, subject, keyword…" value="' +
            esc(st.q) +
            '"></div>' +
            '<select id="cat-avail" class="input lg:w-44"><option value="">Any availability</option><option value="yes">Available now</option><option value="no">All copies on loan</option></select>' +
            '<select id="cat-subj" class="input lg:w-52"><option value="">All subjects</option>' +
            subjOpts()
              .map(
                (o) =>
                  '<option value="' + esc(o.v) + '">' + esc(o.l) + "</option>",
              )
              .join("") +
            "</select>" +
            '<select id="cat-sort" class="input lg:w-44"><option value="popularity">Most popular</option><option value="title">Title A–Z</option><option value="author">Author A–Z</option><option value="year">Newest year</option></select>' +
            '</div><div id="cat-adv" class="hidden mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-ink/10 pt-3">' +
            '<div><label class="label">Author contains</label><input id="cat-author" class="input w-full" placeholder="Author name…"></div>' +
            '<div><label class="label">Publisher</label><input id="cat-pub" class="input w-full" placeholder="Publisher…"></div>' +
            '<div><label class="label">Call number starts with</label><input id="cat-call" class="input w-full" placeholder="e.g. 610"></div>' +
            '</div><div class="flex justify-between items-center mt-3"><div id="cat-count" class="text-xs text-muted"></div><button id="cat-adv-btn" class="btn btn-ghost btn-sm"><i data-lucide="sliders-horizontal" class="w-4 h-4"></i> Advanced search</button></div></div>' +
            '<div id="cat-results"></div><div id="cat-pager" class="flex justify-center gap-1.5 mt-5"></div>';
          lucide.createIcons();
          function filtered() {
            let rows = DB.get("books");
            const d = Session.dept();
            if (d !== "all") rows = rows.filter((b) => b.dept === d);
            if (st.q) {
              const q = st.q.toLowerCase();
              rows = rows.filter((b) =>
                (
                  b.title +
                  " " +
                  b.author +
                  " " +
                  b.isbn +
                  " " +
                  b.subject +
                  " " +
                  b.callNo +
                  " " +
                  b.publisher
                )
                  .toLowerCase()
                  .includes(q),
              );
            }
            if (st.avail === "yes") rows = rows.filter((b) => b.available > 0);
            if (st.avail === "no") rows = rows.filter((b) => b.available === 0);
            if (st.subject) rows = rows.filter((b) => b.subject === st.subject);
            const au = document
              .getElementById("cat-author")
              .value.trim()
              .toLowerCase();
            const pb = document
              .getElementById("cat-pub")
              .value.trim()
              .toLowerCase();
            const cn = document
              .getElementById("cat-call")
              .value.trim()
              .toLowerCase();
            if (au)
              rows = rows.filter((b) => b.author.toLowerCase().includes(au));
            if (pb)
              rows = rows.filter((b) => b.publisher.toLowerCase().includes(pb));
            if (cn)
              rows = rows.filter((b) => b.callNo.toLowerCase().startsWith(cn));
            if (st.sort === "popularity")
              rows.sort((a, b) => b.popularity - a.popularity);
            if (st.sort === "title")
              rows.sort((a, b) => a.title.localeCompare(b.title));
            if (st.sort === "author")
              rows.sort((a, b) => a.author.localeCompare(b.author));
            if (st.sort === "year") rows.sort((a, b) => b.year - a.year);
            return rows;
          }
          function render() {
            const rows = filtered();
            const pages = Math.max(1, Math.ceil(rows.length / st.per));
            if (st.page > pages) st.page = pages;
            const slice = rows.slice((st.page - 1) * st.per, st.page * st.per);
            document.getElementById("cat-count").textContent =
              rows.length +
              " record" +
              (rows.length === 1 ? "" : "s") +
              " found" +
              (Session.dept() !== "all"
                ? " in " + deptName(Session.dept())
                : "");
            const res = document.getElementById("cat-results");
            if (!slice.length) {
              res.innerHTML =
                '<div class="card">' +
                UI.empty("No catalog records match your search", "search-x") +
                "</div>";
              document.getElementById("cat-pager").innerHTML = "";
              return;
            }
            res.innerHTML =
              '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">' +
              slice
                .map(function (b) {
                  return (
                    '<button class="card p-3 text-left hover:shadow-md hover:-translate-y-0.5 transition group" data-bk="' +
                    b.id +
                    '">' +
                    '<div class="flex justify-center mb-2.5">' +
                    UI.bookCover(b, "md") +
                    "</div>" +
                    '<div class="text-[12.5px] font-semibold leading-snug line-clamp-2 min-h-[2.1em]">' +
                    esc(trunc(b.title, 52)) +
                    "</div>" +
                    '<div class="text-[11px] text-muted mt-0.5 truncate">' +
                    esc(trunc(b.author, 28)) +
                    "</div>" +
                    '<div class="flex items-center justify-between mt-2">' +
                    UI.deptBadge(b.dept) +
                    (b.available > 0
                      ? '<span class="badge badge-green">' +
                        b.available +
                        " avail.</span>"
                      : '<span class="badge badge-red">On loan</span>') +
                    "</div></button>"
                  );
                })
                .join("") +
              "</div>";
            let pg =
              '<button class="pg-btn" data-p="' +
              (st.page - 1) +
              '" ' +
              (st.page <= 1 ? "disabled" : "") +
              ">Prev</button>";
            for (let p = 1; p <= pages; p++)
              pg +=
                '<button class="pg-btn ' +
                (p === st.page ? "active" : "") +
                '" data-p="' +
                p +
                '">' +
                p +
                "</button>";
            pg +=
              '<button class="pg-btn" data-p="' +
              (st.page + 1) +
              '" ' +
              (st.page >= pages ? "disabled" : "") +
              ">Next</button>";
            const pager = document.getElementById("cat-pager");
            pager.innerHTML = pg;
            pager.querySelectorAll("[data-p]").forEach(
              (b) =>
                (b.onclick = function () {
                  st.page = Number(this.dataset.p);
                  render();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }),
            );
            res.querySelectorAll("[data-bk]").forEach(
              (b) =>
                (b.onclick = function () {
                  openBookModal(this.dataset.bk);
                }),
            );
            lucide.createIcons();
          }
          document
            .getElementById("cat-q")
            .addEventListener("input", function () {
              st.q = this.value;
              st.page = 1;
              render();
            });
          ["cat-avail", "cat-subj", "cat-sort"].forEach(function (id) {
            document.getElementById(id).addEventListener("change", function () {
              st[
                id.replace("cat-", "") === "avail"
                  ? "avail"
                  : id.replace("cat-", "") === "subject"
                    ? "subject"
                    : "sort"
              ] = this.value;
              st.page = 1;
              render();
            });
          });
          document.getElementById("cat-adv-btn").onclick = function () {
            document.getElementById("cat-adv").classList.toggle("hidden");
          };
          ["cat-author", "cat-pub", "cat-call"].forEach((id) =>
            document.getElementById(id).addEventListener("input", function () {
              render();
            }),
          );
          render();
        };

        /* ---------- Module 5: Cataloguing (future Koha-ready record structure) ---------- */
        Modules.cataloguing = function (el) {
          const focus = sessionStorage.getItem("cataloguingFocus");
          sessionStorage.removeItem("cataloguingFocus");
          el.innerHTML =
            UI.pageHead({
              title: "Cataloguing",
              desc: "Create and maintain bibliographic and item records. Record structure mirrors common MARC/RDA fields to support the planned Koha ILS integration — all records here are prototype-local.",
              actions: [
                {
                  label: "New Bibliographic Record",
                  icon: "book-plus",
                  cls: "btn-primary",
                  minLevel: 2,
                  onclick: "catNew()",
                },
              ],
            }) +
            '<div class="card p-3.5 mb-5 flex items-start gap-3 bg-blue-50/60 !border-blue-200"><i data-lucide="database-zap" class="w-5 h-5 text-blue-700 mt-0.5"></i><div class="text-xs text-blue-900"><strong>Koha integration (planned):</strong> in production, Koha will be the authoritative source for bibliographic and item records. This prototype simulates cataloguing locally and does not connect to any live system. <span class="koha-tag ml-1">Integration-dependent</span></div></div>' +
            '<div class="card" id="cat-tbl"></div>';
          lucide.createIcons();
          const cols = [
            { key: "callNo", label: "Call no." },
            {
              key: "title",
              label: "Title",
              render: (b) =>
                '<div class="font-semibold">' +
                esc(trunc(b.title, 50)) +
                '</div><div class="text-[11px] text-muted">' +
                esc(b.author) +
                "</div>",
            },
            { key: "isbn", label: "ISBN", cls: "hidden md:table-cell" },
            {
              key: "publisher",
              label: "Publisher / Year",
              render: (b) => esc(b.publisher) + " · " + b.year,
              cls: "hidden lg:table-cell",
            },
            {
              key: "dept",
              label: "Department",
              render: (b) => UI.deptBadge(b.dept),
            },
            {
              key: "copies",
              label: "Items",
              render: (b) =>
                '<span class="font-semibold">' +
                b.copies +
                '</span> copies · <span class="' +
                (b.available > 0 ? "text-green-700" : "text-red-700") +
                '">' +
                b.available +
                " avail.</span>",
            },
            {
              key: "status",
              label: "Status",
              render: (b) =>
                UI.statusBadge(b.status) +
                ' <span class="sim-tag ml-1">local</span>',
            },
          ];
          const acts = [
            { icon: "eye", label: "View", onClick: (b) => openBookModal(b.id) },
          ];
          if (Session.atLeast(2)) {
            acts.push({
              icon: "pen-line",
              label: "Edit",
              onClick: (b) => catEdit(b.id),
            });
            acts.push({
              icon: "copy",
              label: "Duplicate",
              onClick: (b) => catDup(b),
            });
            acts.push({
              icon: "trash-2",
              label: "Delete",
              danger: true,
              onClick: (b) =>
                UI.confirm({
                  title: "Delete record",
                  message:
                    "Delete bibliographic record <strong>" +
                    esc(trunc(b.title, 50)) +
                    "</strong> and all its item copies? This simulated action cannot be undone in this session.",
                  confirmText: "Delete record",
                  onConfirm: function () {
                    DB.remove("books", b.id);
                    DB.audit("Delete", "Cataloguing", b.id + " — " + b.title);
                    logActivity(
                      "Catalogue record deleted: " + trunc(b.title, 40),
                      "catalogue",
                    );
                    UI.toast("Record deleted", "success");
                    App.rerender();
                  },
                }),
            });
          }
          const tbl = UI.renderTable("#cat-tbl", {
            columns: cols,
            rows: () => DB.get("books"),
            searchKeys: ["title", "author", "isbn", "callNo", "subject"],
            searchPlaceholder: "Search records…",
            filters: [
              { key: "dept", label: "All departments", options: deptOpts() },
              {
                key: "status",
                label: "Any status",
                options: [
                  { v: "catalogued", l: "Catalogued" },
                  { v: "processing", l: "Processing" },
                ],
              },
            ],
            actions: acts,
            sortKey: "title",
            onRow: (b) => openBookModal(b.id),
          });
          if (focus) {
            tbl.state.q = focus;
            tbl.refresh();
          }
        };
        function catFields(v) {
          v = v || {};
          return [
            { name: "title", label: "Title", required: true, span: 2 },
            { name: "author", label: "Author", required: true },
            { name: "publisher", label: "Publisher" },
            {
              name: "year",
              label: "Publication year",
              type: "number",
              min: 1500,
            },
            { name: "isbn", label: "ISBN", placeholder: "978-…" },
            { name: "edition", label: "Edition", placeholder: "e.g. 2nd" },
            { name: "subject", label: "Subject heading", required: true },
            {
              name: "dewey",
              label: "Dewey classification",
              placeholder: "e.g. 610.73",
            },
            { name: "callNo", label: "Call number", required: true },
            {
              name: "dept",
              label: "Library department",
              type: "select",
              required: true,
              options: deptOpts(),
            },
            {
              name: "copies",
              label: "Number of copies (items)",
              type: "number",
              min: 1,
              required: true,
            },
            {
              name: "shelf",
              label: "Shelf location",
              placeholder: "e.g. NUR-02",
            },
            {
              name: "status",
              label: "Cataloguing status",
              type: "select",
              options: [
                { v: "catalogued", l: "Catalogued" },
                { v: "processing", l: "In processing" },
              ],
            },
            {
              name: "notes",
              label: "Internal notes",
              type: "textarea",
              span: 2,
              placeholder:
                "Binding, source of acquisition, Koha mapping notes…",
            },
          ];
        }
        window.catNew = function () {
          UI.formModal({
            title: "New bibliographic record",
            subtitle:
              "Fields follow a Koha-compatible structure (simulated locally)",
            size: "lg",
            icon: "book-plus",
            submitText: "Save record",
            values: {
              dept: Session.dept() === "all" ? "college" : Session.dept(),
              copies: 1,
              status: "catalogued",
              year: 2026,
              edition: "1st",
            },
            fields: catFields(),
            onSubmit: function (v, close) {
              const id = uid("BK");
              DB.add(
                "books",
                Object.assign(
                  {
                    id: id,
                    available: Number(v.copies),
                    popularity: 0,
                    dateAdded: todayStr(),
                    source: "prototype-local",
                  },
                  v,
                  { copies: Number(v.copies), year: Number(v.year) },
                ),
              );
              DB.audit("Create", "Cataloguing", id + " — " + v.title);
              logActivity(
                "New record catalogued: " + trunc(v.title, 44),
                "catalogue",
              );
              close();
              UI.toast("Bibliographic record saved", "success");
              App.rerender();
            },
          });
        };
        window.catEdit = function (id) {
          const b = bookById(id);
          if (!b) return;
          UI.formModal({
            title: "Edit record " + b.id,
            subtitle: esc(trunc(b.title, 60)),
            size: "lg",
            icon: "pen-line",
            submitText: "Update record",
            values: b,
            fields: catFields(),
            onSubmit: function (v, close) {
              const books = DB.get("books");
              const i = books.findIndex((x) => x.id === id);
              const copiesDelta = Number(v.copies) - books[i].copies;
              books[i] = Object.assign(books[i], v, {
                copies: Number(v.copies),
                year: Number(v.year),
                available: Math.max(0, books[i].available + copiesDelta),
              });
              DB.set("books", books);
              DB.audit("Update", "Cataloguing", id + " — " + v.title);
              close();
              UI.toast("Record updated", "success");
              App.rerender();
            },
          });
        };
        window.catDup = function (b) {
          UI.confirm({
            title: "Duplicate record",
            message:
              "Create a copy of <strong>" +
              esc(trunc(b.title, 46)) +
              "</strong> as a new bibliographic record?",
            danger: false,
            confirmText: "Duplicate",
            onConfirm: function () {
              const n = Object.assign({}, b, {
                id: uid("BK"),
                title: b.title + " (copy)",
                popularity: 0,
                dateAdded: todayStr(),
                source: "prototype-local",
              });
              DB.add("books", n);
              DB.audit(
                "Create",
                "Cataloguing",
                "Duplicated " + b.id + " → " + n.id,
              );
              UI.toast("Record duplicated", "success");
              App.rerender();
            },
          });
        };

        /* ---------- Module 11: Serials & Periodicals ---------- */
        Modules.serials = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Serials & Periodicals",
              desc: "Journals, magazines and newspapers — subscriptions, issue tracking and publisher information.",
              actions: [
                {
                  label: "Add Serial",
                  icon: "plus",
                  cls: "btn-primary",
                  minLevel: 2,
                  onclick: "serialNew()",
                },
              ],
            }) + '<div class="card" id="ser-tbl"></div>';
          lucide.createIcons();
          const typeIcon = {
            journal: "scroll-text",
            magazine: "book-open",
            newspaper: "newspaper",
          };
          UI.renderTable("#ser-tbl", {
            columns: [
              {
                key: "title",
                label: "Title",
                render: (s) =>
                  '<div class="flex items-center gap-2.5"><span class="stat-ic !w-8 !h-8 !rounded-lg" style="background:#FFF1D6;color:#8A5A00"><i data-lucide="' +
                  (typeIcon[s.type] || "book") +
                  '" class="w-4 h-4"></i></span><div><div class="font-semibold">' +
                  esc(s.title) +
                  '</div><div class="text-[11px] text-muted">' +
                  esc(s.publisher) +
                  " · " +
                  esc(s.frequency) +
                  "</div></div></div>",
              },
              {
                key: "type",
                label: "Type",
                render: (s) => UI.badge(s.type, "gold"),
              },
              { key: "issn", label: "ISSN", cls: "hidden md:table-cell" },
              {
                key: "dept",
                label: "Department",
                render: (s) => UI.deptBadge(s.dept),
              },
              {
                key: "subStatus",
                label: "Subscription",
                render: (s) =>
                  UI.statusBadge(s.subStatus) +
                  (s.price
                    ? '<div class="text-[11px] text-muted mt-0.5">' +
                      money(s.price) +
                      "/yr</div>"
                    : ""),
              },
              {
                key: "received",
                label: "Issues",
                render: (s) => {
                  const pct = s.expected
                    ? Math.min(100, Math.round((s.received / s.expected) * 100))
                    : 0;
                  return (
                    '<div class="min-w-[110px]"><div class="text-[11px] mb-1">' +
                    s.received +
                    " / " +
                    s.expected +
                    ' received</div><div class="progress gold"><div style="width:' +
                    pct +
                    '%"></div></div></div>'
                  );
                },
              },
              {
                key: "nextDue",
                label: "Next issue",
                render: (s) => fmtDate(s.nextDue === "—" ? null : s.nextDue),
              },
            ],
            rows: () => DB.get("serials"),
            searchKeys: ["title", "publisher", "issn"],
            searchPlaceholder: "Search serials…",
            filters: [
              {
                key: "type",
                label: "All types",
                options: [
                  { v: "journal", l: "Journals" },
                  { v: "magazine", l: "Magazines" },
                  { v: "newspaper", l: "Newspapers" },
                ],
              },
              {
                key: "subStatus",
                label: "Any status",
                options: [
                  { v: "active", l: "Active" },
                  { v: "expired", l: "Expired" },
                  { v: "trial", l: "Trial" },
                ],
              },
            ],
            actions: [
              {
                icon: "check-check",
                label: "Mark issue received",
                show: (s) => s.subStatus === "active",
                onClick: (s) => {
                  DB.update("serials", s.id, { received: s.received + 1 });
                  DB.audit("Receive", "Serials", "Issue received: " + s.title);
                  logActivity("Serial issue received: " + s.title, "catalogue");
                  UI.toast("Issue marked as received", "success");
                  App.rerender();
                },
              },
              {
                icon: "pen-line",
                label: "Edit",
                show: () => Session.atLeast(2),
                onClick: (s) => serialEdit(s.id),
              },
              {
                icon: "ban",
                label: "Toggle subscription",
                show: () => Session.atLeast(3),
                onClick: (s) => {
                  const next = s.subStatus === "active" ? "expired" : "active";
                  DB.update("serials", s.id, { subStatus: next });
                  DB.audit(
                    "Update",
                    "Serials",
                    s.title + " subscription → " + next,
                  );
                  UI.toast("Subscription " + next, "info");
                  App.rerender();
                },
              },
              {
                icon: "trash-2",
                label: "Delete",
                danger: true,
                show: () => Session.atLeast(3),
                onClick: (s) =>
                  UI.confirm({
                    title: "Delete serial",
                    message:
                      "Remove <strong>" +
                      esc(s.title) +
                      "</strong> from serials control?",
                    confirmText: "Delete",
                    onConfirm: function () {
                      DB.remove("serials", s.id);
                      UI.toast("Serial deleted", "success");
                      App.rerender();
                    },
                  }),
              },
            ],
          });
        };
        function serialFields(v) {
          v = v || {};
          return [
            { name: "title", label: "Title", required: true, span: 2 },
            {
              name: "type",
              label: "Type",
              type: "select",
              required: true,
              options: [
                { v: "journal", l: "Journal" },
                { v: "magazine", l: "Magazine" },
                { v: "newspaper", l: "Newspaper" },
              ],
            },
            {
              name: "frequency",
              label: "Frequency",
              type: "select",
              options: [
                "Daily",
                "Weekly",
                "Bimonthly",
                "Monthly",
                "Quarterly",
                "Semi-annual",
                "Annual",
              ],
            },
            { name: "publisher", label: "Publisher", required: true },
            { name: "issn", label: "ISSN" },
            {
              name: "dept",
              label: "Department",
              type: "select",
              required: true,
              options: deptOpts(),
            },
            {
              name: "subStatus",
              label: "Subscription status",
              type: "select",
              options: [
                { v: "active", l: "Active" },
                { v: "expired", l: "Expired" },
                { v: "trial", l: "Trial" },
              ],
            },
            {
              name: "price",
              label: "Annual price (₱)",
              type: "number",
              min: 0,
            },
            {
              name: "expected",
              label: "Expected issues / yr",
              type: "number",
              min: 1,
            },
            { name: "nextDue", label: "Next issue due", type: "date" },
          ];
        }
        window.serialNew = function () {
          UI.formModal({
            title: "Add serial / periodical",
            icon: "newspaper",
            values: {
              dept: Session.dept() === "all" ? "college" : Session.dept(),
              type: "journal",
              frequency: "Monthly",
              subStatus: "active",
              expected: 12,
              price: 0,
            },
            fields: serialFields(),
            onSubmit: function (v, close) {
              DB.add(
                "serials",
                Object.assign({ id: uid("SR"), received: 0 }, v, {
                  price: Number(v.price),
                  expected: Number(v.expected),
                }),
              );
              DB.audit("Create", "Serials", v.title);
              close();
              UI.toast("Serial added", "success");
              App.rerender();
            },
          });
        };
        window.serialEdit = function (id) {
          const s = DB.get("serials").find((x) => x.id === id);
          if (!s) return;
          UI.formModal({
            title: "Edit serial",
            subtitle: esc(s.title),
            icon: "pen-line",
            values: s,
            fields: serialFields(),
            onSubmit: function (v, close) {
              DB.update("serials", id, v);
              close();
              UI.toast("Serial updated", "success");
              App.rerender();
            },
          });
        };

        /* ---------- Module 17: Document Management ---------- */
        Modules.documents = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Document Management",
              desc: "Digital library documents — policies, forms, reports and guidelines. Uploads and downloads are simulated in this prototype.",
              actions: [
                {
                  label: "Upload Document",
                  icon: "upload",
                  cls: "btn-primary",
                  minLevel: 2,
                  onclick: "docNew()",
                },
              ],
            }) + '<div class="card" id="doc-tbl"></div>';
          lucide.createIcons();
          const cats = [...new Set(DB.get("documents").map((d) => d.category))];
          const typeIcon = {
            PDF: "file-text",
            DOCX: "file-type",
            XLSX: "sheet",
          };
          UI.renderTable("#doc-tbl", {
            columns: [
              {
                key: "title",
                label: "Document",
                render: (d) =>
                  '<div class="flex items-center gap-3"><span class="stat-ic !w-9 !h-9 !rounded-lg" style="background:#F6E7E7;color:#7D1519"><i data-lucide="' +
                  (typeIcon[d.type] || "file") +
                  '" class="w-4 h-4"></i></span><div><div class="font-semibold">' +
                  esc(d.title) +
                  '</div><div class="text-[11px] text-muted">' +
                  esc(d.desc || "") +
                  "</div></div></div>",
              },
              {
                key: "category",
                label: "Category",
                render: (d) => UI.badge(d.category, "gold"),
              },
              {
                key: "type",
                label: "Type",
                cls: "hidden md:table-cell",
                render: (d) =>
                  '<span class="chip-code">' +
                  d.type +
                  "</span> · " +
                  esc(d.size),
              },
              {
                key: "by",
                label: "Uploaded by",
                cls: "hidden lg:table-cell",
                render: (d) =>
                  esc(d.by) +
                  '<div class="text-[11px] text-muted">' +
                  fmtDate(d.date) +
                  "</div>",
              },
              {
                key: "access",
                label: "Access",
                render: (d) =>
                  UI.badge(
                    d.access === "all"
                      ? "Everyone"
                      : d.access === "staff"
                        ? "Staff only"
                        : "Administrators",
                    d.access === "all"
                      ? "green"
                      : d.access === "staff"
                        ? "blue"
                        : "maroon",
                  ),
              },
            ],
            rows: () => DB.get("documents"),
            searchKeys: ["title", "category", "by", "desc"],
            searchPlaceholder: "Search documents…",
            filters: [
              { key: "category", label: "All categories", options: cats },
              {
                key: "access",
                label: "Any access",
                options: [
                  { v: "all", l: "Everyone" },
                  { v: "staff", l: "Staff" },
                  { v: "admin", l: "Admin only" },
                ],
              },
            ],
            actions: [
              {
                icon: "eye",
                label: "Preview",
                onClick: (d) =>
                  UI.modal({
                    title: "Document preview",
                    subtitle: esc(d.title) + " · simulated preview",
                    size: "md",
                    body:
                      '<div class="rounded-lg border border-dashed border-ink/20 bg-warm p-10 text-center"><i data-lucide="file-search" class="w-10 h-10 mx-auto text-muted mb-3"></i><p class="font-serif font-bold">' +
                      esc(d.title) +
                      '</p><p class="text-xs text-muted mt-1">' +
                      d.type +
                      " · " +
                      esc(d.size) +
                      " · uploaded " +
                      fmtDate(d.date) +
                      " by " +
                      esc(d.by) +
                      '</p><p class="text-[11px] text-muted mt-4 max-w-xs mx-auto">Actual file rendering is not part of this prototype. This placeholder represents the document preview area.</p></div>',
                    footer:
                      "<button class=\"btn btn-outline\" onclick=\"document.getElementById('modal-root').innerHTML=''\">Close</button>",
                  }),
              },
              {
                icon: "download",
                label: "Download (simulated)",
                onClick: (d) => {
                  UI.download(
                    d.title.replace(/[^\w\- ]/g, "").replace(/ /g, "_") +
                      ".txt",
                    "USANT University Library — SIMULATED DOCUMENT\n\nTitle: " +
                      d.title +
                      "\nCategory: " +
                      d.category +
                      "\nType: " +
                      d.type +
                      " (" +
                      d.size +
                      ")\nUploaded: " +
                      d.date +
                      " by " +
                      d.by +
                      "\nAccess: " +
                      d.access +
                      "\n\n" +
                      (d.desc || "") +
                      "\n\nThis text file stands in for the real document in the frontend prototype.",
                    "text/plain",
                  );
                  DB.audit("Download", "Documents", d.title);
                  UI.toast("Download started (simulated)", "success");
                },
              },
              {
                icon: "trash-2",
                label: "Delete",
                danger: true,
                show: () => Session.atLeast(3),
                onClick: (d) =>
                  UI.confirm({
                    title: "Delete document",
                    message: "Delete <strong>" + esc(d.title) + "</strong>?",
                    confirmText: "Delete",
                    onConfirm: function () {
                      DB.remove("documents", d.id);
                      DB.audit("Delete", "Documents", d.title);
                      UI.toast("Document deleted", "success");
                      App.rerender();
                    },
                  }),
              },
            ],
          });
        };
        window.docNew = function () {
          UI.formModal({
            title: "Upload document",
            subtitle: "File selection is simulated — no file is stored",
            icon: "upload",
            submitText: "Upload (simulated)",
            fields: [
              {
                name: "title",
                label: "Document title",
                required: true,
                span: 2,
              },
              {
                name: "category",
                label: "Category",
                type: "select",
                required: true,
                options: [
                  "Policies",
                  "Reports",
                  "Handbooks",
                  "Guidelines",
                  "Finance",
                  "Accreditation",
                  "Forms",
                ],
              },
              {
                name: "type",
                label: "File type",
                type: "select",
                options: ["PDF", "DOCX", "XLSX"],
              },
              {
                name: "access",
                label: "Access permission",
                type: "select",
                options: [
                  { v: "all", l: "Everyone" },
                  { v: "staff", l: "Staff only" },
                  { v: "admin", l: "Administrators only" },
                ],
              },
              {
                name: "file",
                label: "Choose file (simulated)",
                type: "static",
                value:
                  "<button class=\"btn btn-outline btn-sm\" onclick=\"UI.toast('File picker simulated — a placeholder entry will be created.','info')\"><i data-lucide='paperclip' class='w-4 h-4'></i> Browse…</button>",
                span: 2,
              },
              { name: "desc", label: "Description", type: "textarea", span: 2 },
            ],
            values: { category: "Policies", type: "PDF", access: "staff" },
            onSubmit: function (v, close) {
              DB.add("documents", {
                id: uid("DOC"),
                title: v.title,
                category: v.category,
                type: v.type,
                size: Math.round((0.3 + Math.random() * 4) * 10) / 10 + " MB",
                by: Session.user().name.replace(/(Dr\.|Ms\.|Mr\.)\s*/, ""),
                date: todayStr(),
                access: v.access,
                desc: v.desc,
              });
              DB.audit("Upload", "Documents", v.title + " (simulated)");
              close();
              UI.toast("Document uploaded (simulated)", "success");
              App.rerender();
            },
          });
        };

        /* ---------- Module 12: Inventory Management ---------- */
        Modules.inventory = function (el) {
          const books = DB.get("books");
          const flags = DB.get("inventoryFlags");
          const scoped = (d) =>
            Session.dept() === "all"
              ? d
              : d.filter((x) => x.dept === Session.dept());
          const sBooks = scoped(books);
          const totalCopies = sBooks.reduce((s, b) => s + b.copies, 0);
          const openFlags = flags.filter(
            (f) =>
              f.status === "open" &&
              !f.dept &&
              (Session.dept() === "all" ||
                (bookById(f.bookId) || {}).dept === Session.dept()),
          );
          const missing = openFlags.filter((f) => f.type === "missing").length;
          const damaged = openFlags.filter((f) => f.type === "damaged").length;
          const lost = openFlags.filter((f) => f.type === "lost").length;
          const last = SEED.stocktakes[0];
          el.innerHTML =
            UI.pageHead({
              title: "Inventory Management",
              desc: "Physical verification, stocktaking, shelf locations and inventory adjustments across the collection.",
              actions: [
                {
                  label: "New Stocktake",
                  icon: "clipboard-check",
                  cls: "btn-primary",
                  minLevel: 2,
                  onclick: "stocktakeNew()",
                },
              ],
            }) +
            '<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-5">' +
            UI.statCard({
              label: "Total copies",
              value: totalCopies.toLocaleString(),
              icon: "library",
              tone: "maroon",
            }) +
            UI.statCard({
              label: "On shelf (available)",
              value: sBooks.reduce((s, b) => s + b.available, 0),
              icon: "check-check",
              tone: "green",
            }) +
            UI.statCard({
              label: "On loan",
              value: sBooks.reduce((s, b) => s + (b.copies - b.available), 0),
              icon: "repeat",
              tone: "blue",
            }) +
            UI.statCard({
              label: "Missing",
              value: missing,
              icon: "help-circle",
              tone: "amber",
            }) +
            UI.statCard({
              label: "Damaged",
              value: damaged,
              icon: "bandage",
              tone: "red",
            }) +
            UI.statCard({
              label: "Lost",
              value: lost,
              icon: "x-circle",
              tone: "gray",
            }) +
            "</div>" +
            '<div class="grid lg:grid-cols-3 gap-5">' +
            '<div class="lg:col-span-2 space-y-5">' +
            '<div class="card"><div class="p-4 border-b border-ink/8 flex items-center justify-between"><h3 class="font-serif font-bold">Discrepancies & adjustments</h3><button class="btn btn-outline btn-sm" onclick="invFlagNew()"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Log discrepancy</button></div><div id="inv-flags"></div></div>' +
            '<div class="card"><div class="p-4 border-b border-ink/8"><h3 class="font-serif font-bold">Shelf verification sample</h3><p class="text-xs text-muted mt-0.5">Condition check per shelf location — simulated verification list</p></div><div id="inv-shelf"></div></div>' +
            "</div>" +
            '<div class="space-y-5">' +
            '<div class="card p-4"><h3 class="font-serif font-bold mb-3">Stocktake history</h3><div class="space-y-3">' +
            DB.get("stocktakes")
              .map(function (s) {
                return (
                  '<div class="border border-ink/8 rounded-lg p-3"><div class="flex justify-between items-start"><div><div class="font-semibold text-sm">' +
                  esc(s.id) +
                  '</div><div class="text-[11px] text-muted">' +
                  fmtDate(s.date) +
                  " · " +
                  esc(s.by) +
                  "</div></div>" +
                  UI.badge(s.status, "green") +
                  "</div>" +
                  '<div class="text-xs text-muted mt-1.5">' +
                  esc(s.scope) +
                  "</div>" +
                  '<div class="grid grid-cols-4 gap-2 mt-2.5 text-center"><div><div class="font-bold text-sm">' +
                  s.verified +
                  '</div><div class="text-[10px] text-muted uppercase">Verified</div></div><div><div class="font-bold text-sm">' +
                  s.missing +
                  '</div><div class="text-[10px] text-muted uppercase">Missing</div></div><div><div class="font-bold text-sm">' +
                  s.damaged +
                  '</div><div class="text-[10px] text-muted uppercase">Damaged</div></div><div><div class="font-bold text-sm text-green-700">' +
                  s.accuracy +
                  '%</div><div class="text-[10px] text-muted uppercase">Accuracy</div></div></div></div>'
                );
              })
              .join("") +
            "</div></div>" +
            '<div class="card p-4"><h3 class="font-serif font-bold mb-2">Last verification</h3><p class="text-sm text-muted">' +
            esc(last.scope) +
            " — " +
            fmtDate(last.date) +
            '</p><div class="mt-3"><div class="flex justify-between text-xs mb-1"><span>Shelf accuracy</span><span class="font-bold">' +
            last.accuracy +
            '%</span></div><div class="progress"><div style="width:' +
            last.accuracy +
            '%"></div></div></div></div>' +
            "</div>" +
            "</div>";
          lucide.createIcons();
          UI.renderTable("#inv-flags", {
            columns: [
              {
                key: "bookId",
                label: "Item",
                render: (f) =>
                  '<div class="font-semibold">' +
                  esc(trunc(bookTitle(f.bookId), 40)) +
                  '</div><div class="text-[11px] text-muted">' +
                  f.bookId +
                  " · qty " +
                  f.qty +
                  "</div>",
              },
              {
                key: "type",
                label: "Type",
                render: (f) => UI.statusBadge(f.type),
              },
              {
                key: "note",
                label: "Note",
                cls: "hidden md:table-cell",
                render: (f) =>
                  '<span class="text-xs">' + esc(f.note) + "</span>",
              },
              { key: "date", label: "Logged", render: (f) => fmtDate(f.date) },
              {
                key: "status",
                label: "Status",
                render: (f) => UI.statusBadge(f.status),
              },
            ],
            rows: () => DB.get("inventoryFlags"),
            deptScope: false,
            searchKeys: ["note", "bookId"],
            searchPlaceholder: "Search discrepancies…",
            pageSize: 6,
            filters: [
              {
                key: "type",
                label: "All types",
                options: [
                  { v: "missing", l: "Missing" },
                  { v: "damaged", l: "Damaged" },
                  { v: "lost", l: "Lost" },
                ],
              },
              {
                key: "status",
                label: "Any status",
                options: [
                  { v: "open", l: "Open" },
                  { v: "resolved", l: "Resolved" },
                ],
              },
            ],
            actions: [
              {
                icon: "check",
                label: "Resolve",
                show: (f) => f.status === "open" && Session.atLeast(2),
                onClick: (f) => {
                  DB.update("inventoryFlags", f.id, { status: "resolved" });
                  DB.audit("Resolve", "Inventory", f.id + " resolved");
                  logActivity(
                    "Inventory discrepancy resolved: " +
                      trunc(bookTitle(f.bookId), 36),
                    "inventory",
                  );
                  UI.toast("Discrepancy resolved", "success");
                  App.rerender();
                },
              },
              {
                icon: "trash-2",
                label: "Delete",
                danger: true,
                show: () => Session.atLeast(3),
                onClick: (f) =>
                  UI.confirm({
                    title: "Remove log entry",
                    message: "Delete inventory log " + f.id + "?",
                    confirmText: "Delete",
                    onConfirm: function () {
                      DB.remove("inventoryFlags", f.id);
                      UI.toast("Entry removed", "success");
                      App.rerender();
                    },
                  }),
              },
            ],
          });
          const shelfRows = sBooks
            .slice(0, 8)
            .map((b) => ({
              id: b.id,
              shelf: b.shelf,
              title: b.title,
              dept: b.dept,
              copies: b.copies,
              available: b.available,
              condition:
                b.available === b.copies
                  ? "good"
                  : flags.some((f) => f.bookId === b.id && f.status === "open")
                    ? "flagged"
                    : "good",
            }));
          UI.renderTable("#inv-shelf", {
            columns: [
              {
                key: "shelf",
                label: "Shelf",
                render: (r) =>
                  '<span class="chip-code">' + esc(r.shelf) + "</span>",
              },
              {
                key: "title",
                label: "Title",
                render: (r) => esc(trunc(r.title, 40)),
              },
              {
                key: "dept",
                label: "Dept",
                render: (r) => UI.deptBadge(r.dept),
                cls: "hidden md:table-cell",
              },
              {
                key: "copies",
                label: "Copies",
                render: (r) => r.available + "/" + r.copies,
              },
              {
                key: "condition",
                label: "Condition",
                render: (r) =>
                  r.condition === "good"
                    ? UI.badge("Verified", "green")
                    : UI.badge("Flagged", "amber"),
              },
            ],
            rows: shelfRows,
            search: false,
            pageSize: 8,
            deptScope: false,
          });
        };
        window.invFlagNew = function () {
          const books = DB.get("books");
          UI.formModal({
            title: "Log inventory discrepancy",
            icon: "clipboard-plus",
            submitText: "Log discrepancy",
            fields: [
              {
                name: "bookId",
                label: "Book / item",
                type: "select",
                required: true,
                span: 2,
                options: books.map((b) => ({
                  v: b.id,
                  l: b.callNo + " — " + trunc(b.title, 44),
                })),
              },
              {
                name: "type",
                label: "Type",
                type: "select",
                required: true,
                options: [
                  { v: "missing", l: "Missing" },
                  { v: "damaged", l: "Damaged" },
                  { v: "lost", l: "Lost" },
                ],
              },
              {
                name: "qty",
                label: "Quantity affected",
                type: "number",
                min: 1,
                value: 1,
              },
              { name: "note", label: "Note", type: "textarea", span: 2 },
            ],
            onSubmit: function (v, close) {
              DB.add("inventoryFlags", {
                id: uid("IF"),
                bookId: v.bookId,
                type: v.type,
                qty: Number(v.qty) || 1,
                note: v.note,
                date: todayStr(),
                status: "open",
                by: Session.user().name.replace(/(Dr\.|Ms\.|Mr\.)\s*/, ""),
              });
              DB.audit(
                "Create",
                "Inventory",
                "Discrepancy logged for " + v.bookId,
              );
              close();
              UI.toast("Discrepancy logged", "success");
              App.rerender();
            },
          });
        };
        window.stocktakeNew = function () {
          const books = DB.get("books");
          UI.formModal({
            title: "Run stocktake (simulated)",
            subtitle:
              "Physical verification session — results are generated for demonstration",
            icon: "clipboard-check",
            submitText: "Run verification",
            fields: [
              {
                name: "scope",
                label: "Scope description",
                required: true,
                span: 2,
                placeholder: "e.g. College Library — Nursing section",
              },
              {
                name: "dept",
                label: "Department",
                type: "select",
                required: true,
                options: deptOpts(),
                value: Session.dept() === "all" ? "college" : Session.dept(),
              },
            ],
            onSubmit: function (v, close) {
              close();
              const m = UI.modal({
                title: "Running stocktake…",
                size: "sm",
                body: '<div class="text-center py-6"><div class="spinner !border-maroon/30 !border-t-maroon mx-auto !w-8 !h-8"></div><p class="text-sm text-muted mt-4">Verifying shelf locations against catalog records (simulated)…</p></div>',
              });
              setTimeout(function () {
                const scoped = books.filter((b) => b.dept === v.dept);
                const expected = scoped.reduce((s, b) => s + b.copies, 0);
                const missing = Math.min(3, Math.floor(expected * 0.006));
                const damaged = Math.min(2, Math.floor(expected * 0.004));
                const verified = expected - missing;
                const rec = {
                  id:
                    "ST-" +
                    new Date().getFullYear() +
                    "-0" +
                    (DB.get("stocktakes").length + 1),
                  date: todayStr(),
                  scope: v.scope,
                  verified: verified,
                  expected: expected,
                  missing: missing,
                  damaged: damaged,
                  accuracy: Math.round((verified / expected) * 1000) / 10,
                  by: Session.user().name.replace(/(Dr\.|Ms\.|Mr\.)\s*/, ""),
                  status: "completed",
                };
                DB.add("stocktakes", rec);
                DB.audit(
                  "Stocktake",
                  "Inventory",
                  rec.id + " — " + rec.accuracy + "% accuracy",
                );
                logActivity(
                  "Stocktake completed: " +
                    v.scope +
                    " (" +
                    rec.accuracy +
                    "% accuracy)",
                  "inventory",
                );
                m.close();
                UI.modal({
                  title: "Stocktake complete ✓",
                  subtitle: rec.id,
                  size: "sm",
                  body:
                    '<div class="grid grid-cols-4 gap-2 text-center"><div><div class="font-serif text-xl font-bold">' +
                    verified +
                    '</div><div class="text-[10px] uppercase text-muted">Verified</div></div><div><div class="font-serif text-xl font-bold">' +
                    expected +
                    '</div><div class="text-[10px] uppercase text-muted">Expected</div></div><div><div class="font-serif text-xl font-bold text-amber-600">' +
                    missing +
                    '</div><div class="text-[10px] uppercase text-muted">Missing</div></div><div><div class="font-serif text-xl font-bold text-green-700">' +
                    rec.accuracy +
                    '%</div><div class="text-[10px] uppercase text-muted">Accuracy</div></div></div>',
                  footer:
                    "<button class=\"btn btn-primary\" onclick=\"document.getElementById('modal-root').innerHTML='';App.rerender()\">Done</button>",
                });
              }, 1200);
            },
          });
        };

        /* ---------- Module 10: Acquisitions ---------- */
        Modules.acquisitions = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Acquisitions",
              desc: "Purchase requests, orders, suppliers and budget allocation for collection development.",
              actions: [
                {
                  label: "New Purchase Request",
                  icon: "cart-plus",
                  cls: "btn-primary",
                  minLevel: 2,
                  onclick: "reqNew()",
                },
              ],
            }) +
            '<div class="tabs mb-5" id="acq-tabs">' +
            '<button class="tab-btn active" data-t="requests">Purchase Requests</button><button class="tab-btn" data-t="orders">Purchase Orders</button><button class="tab-btn" data-t="suppliers">Suppliers</button><button class="tab-btn" data-t="budget">Budget Allocation</button>' +
            '</div><div id="acq-body"></div>';
          lucide.createIcons();
          const tabs = {
            requests: function () {
              document.getElementById("acq-body").innerHTML =
                '<div class="card" id="acq-req"></div>';
              const canApprove = Session.atLeast(3);
              UI.renderTable("#acq-req", {
                columns: [
                  { key: "id", label: "Req #" },
                  {
                    key: "title",
                    label: "Title requested",
                    render: (r) =>
                      '<div class="font-semibold">' +
                      esc(r.title) +
                      '</div><div class="text-[11px] text-muted">' +
                      esc(r.note || "") +
                      "</div>",
                  },
                  {
                    key: "requester",
                    label: "Requested by",
                    cls: "hidden md:table-cell",
                  },
                  {
                    key: "dept",
                    label: "Dept",
                    render: (r) => UI.deptBadge(r.dept),
                  },
                  {
                    key: "qty",
                    label: "Qty × Est.",
                    render: (r) => r.qty + " × " + money(r.estCost / r.qty),
                  },
                  {
                    key: "estCost",
                    label: "Total",
                    render: (r) =>
                      '<span class="font-semibold">' +
                      money(r.estCost) +
                      "</span>",
                  },
                  {
                    key: "priority",
                    label: "Priority",
                    render: (r) =>
                      UI.badge(
                        r.priority,
                        r.priority === "high"
                          ? "red"
                          : r.priority === "medium"
                            ? "amber"
                            : "gray",
                      ),
                  },
                  {
                    key: "date",
                    label: "Date",
                    render: (r) => fmtDate(r.date),
                    cls: "hidden lg:table-cell",
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (r) => UI.statusBadge(r.status),
                  },
                ],
                rows: () => DB.get("requests"),
                searchKeys: ["title", "requester", "id"],
                searchPlaceholder: "Search requests…",
                filters: [
                  {
                    key: "status",
                    label: "Any status",
                    options: [
                      { v: "pending", l: "Pending" },
                      { v: "approved", l: "Approved" },
                      { v: "ordered", l: "Ordered" },
                      { v: "received", l: "Received" },
                      { v: "rejected", l: "Rejected" },
                    ],
                  },
                ],
                actions: [
                  {
                    icon: "check",
                    label: "Approve",
                    show: (r) => r.status === "pending" && canApprove,
                    onClick: (r) => {
                      DB.update("requests", r.id, { status: "approved" });
                      DB.audit("Approve", "Acquisitions", r.id + " approved");
                      logActivity(
                        "Purchase request approved: " + trunc(r.title, 40),
                        "acquisition",
                      );
                      UI.toast("Request approved", "success");
                      App.rerender();
                    },
                  },
                  {
                    icon: "x",
                    label: "Reject",
                    danger: true,
                    show: (r) => r.status === "pending" && canApprove,
                    onClick: (r) =>
                      UI.confirm({
                        title: "Reject request",
                        message: "Reject purchase request " + r.id + "?",
                        confirmText: "Reject",
                        onConfirm: function () {
                          DB.update("requests", r.id, { status: "rejected" });
                          DB.audit("Reject", "Acquisitions", r.id);
                          UI.toast("Request rejected", "info");
                          App.rerender();
                        },
                      }),
                  },
                  {
                    icon: "truck",
                    label: "Mark ordered",
                    show: (r) => r.status === "approved" && canApprove,
                    onClick: (r) => {
                      DB.update("requests", r.id, { status: "ordered" });
                      DB.audit(
                        "Order",
                        "Acquisitions",
                        r.id + " sent to supplier",
                      );
                      UI.toast("Marked as ordered", "success");
                      App.rerender();
                    },
                  },
                  {
                    icon: "package-check",
                    label: "Mark received",
                    show: (r) => r.status === "ordered" && Session.atLeast(2),
                    onClick: (r) => {
                      DB.update("requests", r.id, { status: "received" });
                      DB.audit("Receive", "Acquisitions", r.id + " received");
                      logActivity(
                        "Acquisition received: " + trunc(r.title, 40),
                        "acquisition",
                      );
                      UI.toast(
                        "Marked as received — ready for cataloguing",
                        "success",
                      );
                      App.rerender();
                    },
                  },
                  {
                    icon: "trash-2",
                    label: "Delete",
                    danger: true,
                    show: () => Session.atLeast(4),
                    onClick: (r) =>
                      UI.confirm({
                        title: "Delete request",
                        message: "Delete " + r.id + "?",
                        confirmText: "Delete",
                        onConfirm: function () {
                          DB.remove("requests", r.id);
                          UI.toast("Request deleted", "success");
                          App.rerender();
                        },
                      }),
                  },
                ],
              });
            },
            orders: function () {
              document.getElementById("acq-body").innerHTML =
                '<div class="card" id="acq-ord"></div>';
              UI.renderTable("#acq-ord", {
                columns: [
                  { key: "id", label: "PO #" },
                  {
                    key: "supplierId",
                    label: "Supplier",
                    render: (o) => {
                      const s = DB.get("suppliers").find(
                        (x) => x.id === o.supplierId,
                      );
                      return s ? esc(s.name) : o.supplierId;
                    },
                  },
                  { key: "items", label: "Items" },
                  {
                    key: "cost",
                    label: "Amount",
                    render: (o) =>
                      '<span class="font-semibold">' +
                      money(o.cost) +
                      "</span>",
                  },
                  {
                    key: "date",
                    label: "Ordered",
                    render: (o) => fmtDate(o.date),
                  },
                  {
                    key: "expected",
                    label: "Expected",
                    render: (o) => fmtDate(o.expected),
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (o) => UI.statusBadge(o.status),
                  },
                ],
                rows: () => DB.get("orders"),
                searchKeys: ["id"],
                deptScope: false,
                searchPlaceholder: "Search POs…",
                actions: [
                  {
                    icon: "check-check",
                    label: "Mark received",
                    show: (o) => o.status !== "received" && Session.atLeast(2),
                    onClick: (o) => {
                      DB.update("orders", o.id, { status: "received" });
                      DB.audit(
                        "Receive",
                        "Acquisitions",
                        "PO " + o.id + " received",
                      );
                      UI.toast("Purchase order received", "success");
                      App.rerender();
                    },
                  },
                ],
              });
            },
            suppliers: function () {
              document.getElementById("acq-body").innerHTML =
                '<div class="card" id="acq-sup"></div>';
              UI.renderTable("#acq-sup", {
                columns: [
                  {
                    key: "name",
                    label: "Supplier",
                    render: (s) =>
                      '<div class="font-semibold">' +
                      esc(s.name) +
                      '</div><div class="text-[11px] text-muted">' +
                      esc(s.city) +
                      "</div>",
                  },
                  {
                    key: "contact",
                    label: "Contact",
                    render: (s) =>
                      esc(s.contact) +
                      '<div class="text-[11px] text-muted">' +
                      esc(s.email) +
                      "</div>",
                  },
                  { key: "phone", label: "Phone", cls: "hidden md:table-cell" },
                  {
                    key: "terms",
                    label: "Payment terms",
                    render: (s) => UI.badge(s.terms, "blue"),
                  },
                  {
                    key: "rating",
                    label: "Rating",
                    render: (s) =>
                      '<span class="text-gold">★</span> <span class="font-semibold">' +
                      s.rating +
                      "</span>",
                  },
                ],
                rows: () => DB.get("suppliers"),
                searchKeys: ["name", "city", "email"],
                deptScope: false,
                searchPlaceholder: "Search suppliers…",
                actions: [
                  {
                    icon: "trash-2",
                    label: "Remove",
                    danger: true,
                    show: () => Session.atLeast(4),
                    onClick: (s) =>
                      UI.confirm({
                        title: "Remove supplier",
                        message:
                          "Remove <strong>" +
                          esc(s.name) +
                          "</strong> from the supplier list?",
                        confirmText: "Remove",
                        onConfirm: function () {
                          DB.remove("suppliers", s.id);
                          UI.toast("Supplier removed", "success");
                          App.rerender();
                        },
                      }),
                  },
                ],
              });
            },
            budget: function () {
              const b = DB.get("budget");
              const totalA = b.reduce((s, x) => s + x.allocated, 0),
                totalS = b.reduce((s, x) => s + x.spent, 0);
              document.getElementById("acq-body").innerHTML =
                '<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">' +
                b
                  .map(function (x) {
                    const pct = Math.round((x.spent / x.allocated) * 100);
                    return (
                      '<div class="card p-5"><div class="flex items-center justify-between mb-3">' +
                      UI.deptBadge(x.dept) +
                      '<button class="btn btn-ghost btn-sm" data-edit-budget="' +
                      x.dept +
                      '" ' +
                      (Session.atLeast(4) ? "" : 'style="display:none"') +
                      '><i data-lucide="pen-line" class="w-3.5 h-3.5"></i> Edit</button></div>' +
                      '<div class="font-serif text-2xl font-bold">' +
                      money(x.allocated) +
                      '</div><div class="text-xs text-muted mb-3">allocated for FY2026</div>' +
                      '<div class="flex justify-between text-xs mb-1"><span class="text-muted">Utilized</span><span class="font-bold">' +
                      money(x.spent) +
                      " (" +
                      pct +
                      "%)</span></div>" +
                      '<div class="progress ' +
                      (pct > 85 ? "gold" : "") +
                      '"><div style="width:' +
                      pct +
                      '%"></div></div>' +
                      '<div class="text-xs text-muted mt-2">Remaining: <strong class="text-ink">' +
                      money(x.allocated - x.spent) +
                      "</strong></div></div>"
                    );
                  })
                  .join("") +
                '<div class="card p-5 bg-warm"><div class="text-xs uppercase tracking-wider text-muted font-semibold mb-1">University total</div><div class="font-serif text-2xl font-bold text-maroon">' +
                money(totalA) +
                '</div><div class="text-xs text-muted mt-1">' +
                money(totalS) +
                " utilized (" +
                Math.round((totalS / totalA) * 100) +
                '%) across 5 library departments</div><div class="mt-4 progress gold"><div style="width:' +
                Math.round((totalS / totalA) * 100) +
                '%"></div></div></div>' +
                "</div>";
              lucide.createIcons();
              document
                .querySelectorAll("[data-edit-budget]")
                .forEach(function (b2) {
                  b2.onclick = function () {
                    const d = b2.dataset.editBudget;
                    const rec = DB.get("budget").find((x) => x.dept === d);
                    UI.formModal({
                      title: "Budget — " + deptName(d),
                      icon: "wallet",
                      values: rec,
                      fields: [
                        {
                          name: "allocated",
                          label: "Allocated (₱)",
                          type: "number",
                          min: 0,
                          required: true,
                        },
                        {
                          name: "spent",
                          label: "Spent (₱)",
                          type: "number",
                          min: 0,
                          required: true,
                        },
                      ],
                      onSubmit: function (v, close) {
                        const arr = DB.get("budget");
                        const i = arr.findIndex((x) => x.dept === d);
                        arr[i].allocated = Number(v.allocated);
                        arr[i].spent = Number(v.spent);
                        DB.set("budget", arr);
                        DB.audit(
                          "Update",
                          "Acquisitions",
                          "Budget updated for " + d,
                        );
                        close();
                        UI.toast("Budget updated", "success");
                        App.rerender();
                      },
                    });
                  };
                });
            },
          };
          tabs.requests();
          document.querySelectorAll("#acq-tabs .tab-btn").forEach(function (b) {
            b.onclick = function () {
              document
                .querySelectorAll("#acq-tabs .tab-btn")
                .forEach((x) => x.classList.remove("active"));
              b.classList.add("active");
              tabs[b.dataset.t]();
              lucide.createIcons();
            };
          });
        };
        window.reqNew = function () {
          UI.formModal({
            title: "New purchase request",
            icon: "cart-plus",
            submitText: "Submit request",
            values: {
              dept: Session.dept() === "all" ? "college" : Session.dept(),
              qty: 1,
              priority: "medium",
            },
            fields: [
              {
                name: "title",
                label: "Title / resource requested",
                required: true,
                span: 2,
              },
              {
                name: "requester",
                label: "Requested by",
                required: true,
                value: Session.user().name,
              },
              {
                name: "dept",
                label: "Library department",
                type: "select",
                required: true,
                options: deptOpts(),
              },
              {
                name: "qty",
                label: "Quantity",
                type: "number",
                min: 1,
                required: true,
              },
              {
                name: "estCost",
                label: "Estimated total cost (₱)",
                type: "number",
                min: 0,
                required: true,
              },
              {
                name: "priority",
                label: "Priority",
                type: "select",
                options: [
                  { v: "high", l: "High" },
                  { v: "medium", l: "Medium" },
                  { v: "low", l: "Low" },
                ],
              },
              {
                name: "note",
                label: "Justification / note",
                type: "textarea",
                span: 2,
              },
            ],
            onSubmit: function (v, close) {
              DB.add("requests", {
                id: uid("PR"),
                title: v.title,
                requester: v.requester,
                dept: v.dept,
                qty: Number(v.qty),
                estCost: Number(v.estCost),
                date: todayStr(),
                status: "pending",
                priority: v.priority,
                note: v.note,
              });
              DB.audit(
                "Create",
                "Acquisitions",
                "Purchase request: " + v.title,
              );
              logActivity(
                "Purchase request submitted: " + trunc(v.title, 40),
                "acquisition",
              );
              close();
              UI.toast("Purchase request submitted for approval", "success");
              App.rerender();
            },
          });
        };
      })();

      /* FILE: js/modules/patrons.js — Patrons, Student Portal Mgmt, Circulation, Reservations, Fines, Facilities */
      (function () {
        function deptOpts() {
          return DEPARTMENTS.map((d) => ({ v: d.id, l: d.name }));
        }
        function scopedPatrons() {
          let p = DB.get("patrons");
          const d = Session.dept();
          if (d !== "all") p = p.filter((x) => x.dept === d);
          return p;
        }

        /* ---------- Module 6: Patron Management ---------- */
        Modules.patrons = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Patron Management",
              desc: "Students, faculty and staff registered with the library — membership, borrowing history, fines and account status. In production, patron data will synchronize from Koha where integrated.",
              actions: [
                {
                  label: "Add Patron",
                  icon: "user-plus",
                  cls: "btn-primary",
                  minLevel: 2,
                  onclick: "patronNew()",
                },
              ],
            }) +
            '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5" id="pat-cards"></div>' +
            '<div class="card" id="pat-tbl"></div>';
          lucide.createIcons();
          const pats = scopedPatrons();
          document.getElementById("pat-cards").innerHTML =
            UI.statCard({
              label: "Registered patrons",
              value: pats.length,
              icon: "users",
              tone: "maroon",
              sub:
                "across " +
                deptShort(
                  Session.dept() === "all" ? "college" : Session.dept(),
                ) +
                (Session.dept() === "all" ? " (all departments)" : ""),
            }) +
            UI.statCard({
              label: "Students",
              value: pats.filter((p) => p.type === "student").length,
              icon: "graduation-cap",
              tone: "gold",
            }) +
            UI.statCard({
              label: "Faculty & staff",
              value: pats.filter((p) => p.type !== "student").length,
              icon: "presentation",
              tone: "blue",
            }) +
            UI.statCard({
              label: "With outstanding fines",
              value: pats.filter((p) => patronOutstanding(p.id) > 0).length,
              icon: "banknote",
              tone: "red",
            });
          UI.renderTable("#pat-tbl", {
            columns: [
              {
                key: "name",
                label: "Patron",
                render: (p) =>
                  '<div class="flex items-center gap-2.5"><span class="avatar avatar-sm">' +
                  initials(p.name) +
                  '</span><div><div class="font-semibold">' +
                  esc(p.name) +
                  '</div><div class="text-[11px] text-muted">' +
                  esc(p.email) +
                  "</div></div></div>",
              },
              { key: "no", label: (p) => "", key: "no", label: "ID number" },
              {
                key: "type",
                label: "Type",
                render: (p) =>
                  UI.badge(
                    p.type,
                    p.type === "student"
                      ? "maroon"
                      : p.type === "faculty"
                        ? "gold"
                        : "blue",
                  ),
              },
              {
                key: "program",
                label: "Program / Unit",
                cls: "hidden md:table-cell",
                render: (p) =>
                  esc(p.program) +
                  '<div class="text-[11px] text-muted">' +
                  esc(p.year) +
                  "</div>",
              },
              {
                key: "dept",
                label: "Library dept",
                render: (p) => UI.deptBadge(p.dept),
                cls: "hidden lg:table-cell",
              },
              {
                key: "borrowed",
                label: "On loan",
                render: (p) => {
                  const n = DB.get("loans").filter(
                    (l) => l.patronId === p.id && loanStatus(l) !== "returned",
                  ).length;
                  return n
                    ? UI.badge(n + " active", "blue")
                    : UI.badge("none", "gray");
                },
              },
              {
                key: "fines",
                label: "Fines due",
                render: (p) => {
                  const o = patronOutstanding(p.id);
                  return o > 0
                    ? '<span class="font-semibold text-red-700">' +
                        money(o) +
                        "</span>"
                    : '<span class="text-muted">—</span>';
                },
              },
              {
                key: "status",
                label: "Status",
                render: (p) => UI.statusBadge(p.status),
              },
            ],
            rows: () => DB.get("patrons"),
            searchKeys: ["name", "no", "email", "program"],
            searchPlaceholder: "Search patrons…",
            filters: [
              {
                key: "type",
                label: "All types",
                options: [
                  { v: "student", l: "Students" },
                  { v: "faculty", l: "Faculty" },
                  { v: "staff", l: "Staff" },
                ],
              },
              {
                key: "status",
                label: "Any status",
                options: [
                  { v: "active", l: "Active" },
                  { v: "suspended", l: "Suspended" },
                ],
              },
            ],
            onRow: (p) => openPatronDrawer(p.id),
            actions: [
              {
                icon: "eye",
                label: "View profile",
                onClick: (p) => openPatronDrawer(p.id),
              },
              {
                icon: "pen-line",
                label: "Edit",
                show: () => Session.atLeast(2),
                onClick: (p) => patronEdit(p.id),
              },
              {
                icon: "user-x",
                label: (p) =>
                  p.status === "active" ? "Suspend" : "Reactivate",
                show: () => Session.atLeast(2),
                onClick: (p) => {
                  const next = p.status === "active" ? "suspended" : "active";
                  UI.confirm({
                    title:
                      next === "suspended"
                        ? "Suspend patron"
                        : "Reactivate patron",
                    message:
                      next === "suspended"
                        ? "Suspend <strong>" +
                          esc(p.name) +
                          "</strong>? Suspended patrons cannot borrow or reserve."
                        : "Reactivate <strong>" + esc(p.name) + "</strong>?",
                    danger: next === "suspended",
                    confirmText:
                      next === "suspended" ? "Suspend" : "Reactivate",
                    onConfirm: function () {
                      DB.update("patrons", p.id, { status: next });
                      DB.audit("Update", "Patrons", p.id + " → " + next);
                      UI.toast("Patron " + next, "success");
                      App.rerender();
                    },
                  });
                },
              },
              {
                icon: "trash-2",
                label: "Delete",
                danger: true,
                show: () => Session.atLeast(4),
                onClick: (p) =>
                  UI.confirm({
                    title: "Delete patron",
                    message:
                      "Delete the record of <strong>" +
                      esc(p.name) +
                      "</strong>? Borrowing history will remain in the transaction log.",
                    confirmText: "Delete",
                    onConfirm: function () {
                      DB.remove("patrons", p.id);
                      DB.audit("Delete", "Patrons", p.id);
                      UI.toast("Patron deleted", "success");
                      App.rerender();
                    },
                  }),
              },
            ],
          });
        };
        function patronFields(v) {
          v = v || {};
          return [
            { name: "name", label: "Full name", required: true, span: 2 },
            {
              name: "type",
              label: "Patron type",
              type: "select",
              required: true,
              options: [
                { v: "student", l: "Student" },
                { v: "faculty", l: "Faculty" },
                { v: "staff", l: "Staff" },
              ],
            },
            { name: "no", label: "Student / ID number", required: true },
            { name: "email", label: "Email", type: "email", required: true },
            { name: "phone", label: "Phone" },
            {
              name: "program",
              label: "Course / Program / Unit",
              required: true,
            },
            {
              name: "year",
              label: "Year level",
              type: "select",
              options: [
                "1st Year",
                "2nd Year",
                "3rd Year",
                "4th Year",
                "Grade 7",
                "Grade 8",
                "Grade 9",
                "Grade 10",
                "Grade 11",
                "Grade 12",
                "Grade 4",
                "Grade 5",
                "Grade 6",
                "Faculty",
                "Staff",
              ],
            },
            {
              name: "dept",
              label: "Library department",
              type: "select",
              required: true,
              options: deptOpts(),
            },
            {
              name: "status",
              label: "Membership status",
              type: "select",
              options: [
                { v: "active", l: "Active" },
                { v: "suspended", l: "Suspended" },
              ],
            },
          ];
        }
        window.patronNew = function () {
          UI.formModal({
            title: "Register patron",
            subtitle:
              "Simulated registration — in production this may sync from the university SIS / Koha",
            icon: "user-plus",
            submitText: "Register patron",
            values: {
              type: "student",
              dept: Session.dept() === "all" ? "college" : Session.dept(),
              status: "active",
              year: "1st Year",
            },
            fields: patronFields(),
            onSubmit: function (v, close) {
              if (DB.get("patrons").some((p) => p.no === v.no)) {
                UI.toast(
                  "A patron with this ID number already exists",
                  "error",
                );
                return;
              }
              DB.add(
                "patrons",
                Object.assign(
                  { id: uid("P"), joined: todayStr(), portalAccess: true },
                  v,
                ),
              );
              DB.audit(
                "Create",
                "Patrons",
                "Registered " + v.name + " (" + v.no + ")",
              );
              logActivity("New patron registered: " + v.name, "patron");
              close();
              UI.toast("Patron registered", "success");
              App.rerender();
            },
          });
        };
        window.patronEdit = function (id) {
          const p = patronById(id);
          if (!p) return;
          UI.formModal({
            title: "Edit patron",
            subtitle: p.id,
            icon: "pen-line",
            submitText: "Save changes",
            values: p,
            fields: patronFields(),
            onSubmit: function (v, close) {
              DB.update("patrons", id, v);
              DB.audit("Update", "Patrons", id);
              close();
              UI.toast("Patron updated", "success");
              App.rerender();
            },
          });
        };

        /* ---------- Module 15 (admin side): Student Portal Management ---------- */
        Modules["student-portal"] = function (el) {
          const cfg = Store.get("portalCfg", SEED.portalCfg);
          const students = DB.get("patrons").filter(
            (p) => p.type === "student",
          );
          el.innerHTML =
            UI.pageHead({
              title: "Student Portal Management",
              desc: "Manage student self-service portal access, borrowing rules and portal announcements.",
              actions: [
                {
                  label: "Open Student Portal",
                  icon: "external-link",
                  cls: "btn-gold",
                  onclick: "Proto.screen('student')",
                },
              ],
            }) +
            '<div class="grid lg:grid-cols-3 gap-5">' +
            '<div class="lg:col-span-2 card"><div class="p-4 border-b border-ink/8"><h3 class="font-serif font-bold">Student portal accounts</h3><p class="text-xs text-muted mt-0.5">Toggle self-service access per student patron</p></div><div id="sp-tbl"></div></div>' +
            '<div class="space-y-5">' +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-1">Portal rules</h3><p class="text-xs text-muted mb-4">Applies to all student portal users (simulated configuration)</p>' +
            '<div class="space-y-3" id="cfg-form">' +
            '<div><label class="label">Max books per student</label><input id="cfg-max" class="input w-full" type="number" min="1" value="' +
            cfg.maxBooks +
            '"></div>' +
            '<label class="flex items-center gap-2 text-sm"><input id="cfg-renew" type="checkbox" class="w-4 h-4" style="accent-color:#7D1519" ' +
            (cfg.allowRenewals ? "checked" : "") +
            "> Allow online renewals</label>" +
            '<label class="flex items-center gap-2 text-sm"><input id="cfg-res" type="checkbox" class="w-4 h-4" style="accent-color:#7D1519" ' +
            (cfg.allowReservations ? "checked" : "") +
            "> Allow online reservations</label>" +
            '<label class="flex items-center gap-2 text-sm"><input id="cfg-fines" type="checkbox" class="w-4 h-4" style="accent-color:#7D1519" ' +
            (cfg.showFines ? "checked" : "") +
            "> Show fines in portal</label>" +
            '<div><label class="label">Portal announcement</label><textarea id="cfg-ann" class="input w-full" rows="3">' +
            esc(cfg.announcement) +
            "</textarea></div>" +
            '<button class="btn btn-primary w-full justify-center" id="cfg-save"><i data-lucide="save" class="w-4 h-4"></i> Save portal settings</button>' +
            "</div></div>" +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-2">Portal activity (simulated)</h3><div class="space-y-2.5 text-sm">' +
            DB.get("logins")
              .filter((l) => l.role === "student")
              .slice(0, 4)
              .map(
                (l) =>
                  '<div class="flex items-center gap-2.5"><span class="health-dot" style="background:' +
                  (l.status === "success" ? "#157F3D" : "#B42318") +
                  '"></span><div class="min-w-0"><div class="truncate text-[13px] font-medium">' +
                  esc(l.user) +
                  '</div><div class="text-[11px] text-muted">' +
                  esc(l.ts) +
                  " · " +
                  l.status +
                  "</div></div></div>",
              )
              .join("") +
            "</div></div>" +
            "</div>" +
            "</div>";
          lucide.createIcons();
          document.getElementById("cfg-save").onclick = function () {
            Store.set("portalCfg", {
              maxBooks: Number(document.getElementById("cfg-max").value) || 3,
              allowRenewals: document.getElementById("cfg-renew").checked,
              allowReservations: document.getElementById("cfg-res").checked,
              showFines: document.getElementById("cfg-fines").checked,
              announcement: document.getElementById("cfg-ann").value,
            });
            DB.audit("Update", "Student Portal", "Portal settings updated");
            UI.toast("Portal settings saved", "success");
          };
          UI.renderTable("#sp-tbl", {
            columns: [
              {
                key: "name",
                label: "Student",
                render: (p) =>
                  '<div class="font-semibold">' +
                  esc(p.name) +
                  '</div><div class="text-[11px] text-muted">' +
                  esc(p.no) +
                  "</div>",
              },
              {
                key: "program",
                label: "Program",
                render: (p) => esc(p.program) + " · " + esc(p.year),
              },
              {
                key: "dept",
                label: "Dept",
                render: (p) => UI.deptBadge(p.dept),
              },
              {
                key: "portalAccess",
                label: "Portal access",
                render: (p) =>
                  p.portalAccess === false
                    ? UI.badge("disabled", "red")
                    : UI.badge("enabled", "green"),
              },
            ],
            rows: () => students,
            searchKeys: ["name", "no", "program"],
            searchPlaceholder: "Search students…",
            pageSize: 8,
            actions: [
              {
                icon: "power",
                label: "Toggle portal access",
                show: () => Session.atLeast(2),
                onClick: (p) => {
                  DB.update("patrons", p.id, {
                    portalAccess: p.portalAccess === false,
                  });
                  DB.audit(
                    "Update",
                    "Student Portal",
                    p.id +
                      " access " +
                      (p.portalAccess === false ? "enabled" : "disabled"),
                  );
                  UI.toast(
                    "Portal access " +
                      (p.portalAccess === false ? "enabled" : "disabled") +
                      " for " +
                      p.name,
                    "info",
                  );
                  App.rerender();
                },
              },
            ],
          });
        };

        /* ---------- Module 7: Book Circulation ---------- */
        Modules.circulation = function (el) {
          const focusPatron = sessionStorage.getItem("circPatron");
          sessionStorage.removeItem("circPatron");
          el.innerHTML =
            UI.pageHead({
              title: "Book Circulation",
              desc: "Check out, check in, renew and review the complete loan history. Circulation rules follow department borrowing policies.",
              actions: [
                {
                  label: "Circulation policies",
                  icon: "book-open-check",
                  cls: "btn-outline",
                  onclick: "location.hash='#/services'",
                },
              ],
            }) +
            '<div class="tabs mb-5" id="circ-tabs">' +
            '<button class="tab-btn active" data-t="checkout"><span class="inline-flex items-center gap-1.5"><i data-lucide="log-in" class="w-4 h-4"></i> Checkout</span></button>' +
            '<button class="tab-btn" data-t="checkin"><span class="inline-flex items-center gap-1.5"><i data-lucide="log-out" class="w-4 h-4"></i> Check-in</span></button>' +
            '<button class="tab-btn" data-t="loans"><span class="inline-flex items-center gap-1.5"><i data-lucide="repeat" class="w-4 h-4"></i> Current loans</span></button>' +
            '<button class="tab-btn" data-t="history"><span class="inline-flex items-center gap-1.5"><i data-lucide="history" class="w-4 h-4"></i> History</span></button>' +
            '</div><div id="circ-body"></div>';
          lucide.createIcons();
          const S = settings();
          function checkoutTab() {
            const pats = scopedPatrons().filter((p) => p.status === "active");
            document.getElementById("circ-body").innerHTML =
              '<div class="grid lg:grid-cols-3 gap-5">' +
              '<div class="lg:col-span-2 card p-5"><h3 class="font-serif font-bold mb-1">Book checkout</h3><p class="text-xs text-muted mb-4">Select a patron and an available item. Loan limits and due dates are applied automatically.</p>' +
              '<div class="grid md:grid-cols-2 gap-4">' +
              '<div class="md:col-span-2"><label class="label">Patron <span class="text-red-600">*</span></label><select id="co-patron" class="input w-full"><option value="">Select patron…</option>' +
              pats
                .map(
                  (p) =>
                    '<option value="' +
                    p.id +
                    '" ' +
                    (focusPatron === p.id ? "selected" : "") +
                    ">" +
                    esc(p.name) +
                    " — " +
                    esc(p.no) +
                    " (" +
                    p.type +
                    ")</option>",
                )
                .join("") +
              '</select><div id="co-pinfo" class="mt-3"></div></div>' +
              '<div class="md:col-span-2"><label class="label">Book <span class="text-red-600">*</span></label><select id="co-book" class="input w-full"><option value="">Select a patron first…</option></select></div>' +
              '<div><label class="label">Loan period (days)</label><input id="co-days" class="input w-full" type="number" min="1" max="60" value="' +
              S.loanDaysStudent +
              '"></div>' +
              '<div><label class="label">Due date</label><input id="co-due" class="input w-full" type="date" value="' +
              dateAdd(todayStr(), S.loanDaysStudent) +
              '"></div>' +
              "</div>" +
              '<div class="flex gap-2 mt-5"><button class="btn btn-primary" id="co-submit"><i data-lucide="check" class="w-4 h-4"></i> Complete checkout</button><button class="btn btn-outline" id="co-clear">Clear</button></div></div>' +
              '<div class="card p-5"><h3 class="font-serif font-bold mb-3">Today at a glance</h3>' +
              '<div class="space-y-3 text-sm">' +
              '<div class="flex justify-between"><span class="text-muted">Checkouts today</span><strong>' +
              DB.get("loans").filter((l) => l.checkout === todayStr()).length +
              "</strong></div>" +
              '<div class="flex justify-between"><span class="text-muted">Returns today</span><strong>' +
              DB.get("loans").filter((l) => l.returned === todayStr()).length +
              "</strong></div>" +
              '<div class="flex justify-between"><span class="text-muted">Items currently on loan</span><strong>' +
              DB.get("loans").filter((l) => loanStatus(l) !== "returned")
                .length +
              "</strong></div>" +
              '<div class="flex justify-between"><span class="text-muted text-red-700">Overdue items</span><strong class="text-red-700">' +
              DB.get("loans").filter((l) => loanStatus(l) === "overdue")
                .length +
              "</strong></div>" +
              '</div><div class="mt-4 p-3 bg-warm rounded-lg text-xs text-muted"><i data-lucide="info" class="w-3.5 h-3.5 inline"></i> Transactions update simulated records in this browser only. In production, Koha performs the authoritative circulation transaction.</div></div>' +
              "</div>";
            lucide.createIcons();
            const ps = document.getElementById("co-patron");
            function fillBooks() {
              const p = patronById(ps.value);
              const bs = document.getElementById("co-book");
              if (!p) {
                bs.innerHTML =
                  '<option value="">Select a patron first…</option>';
                document.getElementById("co-pinfo").innerHTML = "";
                return;
              }
              let books = DB.get("books").filter(
                (b) =>
                  b.available > 0 &&
                  (Session.dept() === "all" ||
                    b.dept === p.dept ||
                    Session.dept() === p.dept),
              );
              if (Session.dept() !== "all")
                books = DB.get("books").filter(
                  (b) => b.available > 0 && b.dept === Session.dept(),
                );
              bs.innerHTML =
                '<option value="">Select an available book…</option>' +
                books
                  .map(
                    (b) =>
                      '<option value="' +
                      b.id +
                      '">' +
                      esc(trunc(b.title, 52)) +
                      " — " +
                      b.callNo +
                      " (" +
                      b.available +
                      " avail.)</option>",
                  )
                  .join("");
              const act = DB.get("loans").filter(
                (l) => l.patronId === p.id && loanStatus(l) !== "returned",
              );
              const od = act.filter((l) => loanStatus(l) === "overdue").length;
              const limit =
                p.type === "student" ? S.maxBooksStudent : S.maxBooksFaculty;
              document.getElementById("co-days").value =
                p.type === "student" ? S.loanDaysStudent : S.loanDaysFaculty;
              document.getElementById("co-due").value = dateAdd(
                todayStr(),
                p.type === "student" ? S.loanDaysStudent : S.loanDaysFaculty,
              );
              document.getElementById("co-pinfo").innerHTML =
                '<div class="card p-3 !rounded-lg bg-warm text-xs space-y-1">' +
                '<div class="flex justify-between"><span class="text-muted">Borrowing limit</span><strong>' +
                act.length +
                " / " +
                limit +
                "</strong></div>" +
                '<div class="flex justify-between"><span class="text-muted">Overdue items</span><strong class="' +
                (od ? "text-red-700" : "") +
                '">' +
                od +
                "</strong></div>" +
                '<div class="flex justify-between"><span class="text-muted">Outstanding fines</span><strong class="' +
                (patronOutstanding(p.id) > 0 ? "text-red-700" : "") +
                '">' +
                money(patronOutstanding(p.id)) +
                "</strong></div></div>";
            }
            ps.onchange = fillBooks;
            fillBooks();
            document.getElementById("co-days").onchange = function () {
              document.getElementById("co-due").value = dateAdd(
                todayStr(),
                Number(this.value) || 7,
              );
            };
            document.getElementById("co-clear").onclick = function () {
              ps.value = "";
              document.getElementById("co-book").innerHTML =
                '<option value="">Select a patron first…</option>';
              document.getElementById("co-pinfo").innerHTML = "";
            };
            document.getElementById("co-submit").onclick = function () {
              const pid = ps.value,
                bid = document.getElementById("co-book").value,
                due = document.getElementById("co-due").value;
              if (!pid) {
                UI.toast("Select a patron", "error");
                return;
              }
              if (!bid) {
                UI.toast("Select a book", "error");
                return;
              }
              const p = patronById(pid),
                b = bookById(bid);
              if (p.status !== "active") {
                UI.toast(p.name + " is suspended and cannot borrow", "error");
                return;
              }
              const act = DB.get("loans").filter(
                (l) => l.patronId === pid && loanStatus(l) !== "returned",
              );
              if (act.some((l) => loanStatus(l) === "overdue")) {
                UI.toast(
                  "Patron has overdue items — resolve them before checkout",
                  "error",
                );
                return;
              }
              const limit =
                p.type === "student" ? S.maxBooksStudent : S.maxBooksFaculty;
              if (act.length >= limit) {
                UI.toast(
                  "Borrowing limit reached (" + limit + " items)",
                  "error",
                );
                return;
              }
              if (patronOutstanding(pid) > 0) {
                UI.toast(
                  "Outstanding fines must be settled first (" +
                    money(patronOutstanding(pid)) +
                    ")",
                  "error",
                );
                return;
              }
              if (!b || b.available < 1) {
                UI.toast("No available copies of this title", "error");
                return;
              }
              if (!due || due < todayStr()) {
                UI.toast("Due date must be today or later", "error");
                return;
              }
              if (act.some((l) => l.bookId === bid)) {
                UI.toast("Patron already has this title on loan", "error");
                return;
              }
              const loan = {
                id: uid("LN"),
                bookId: bid,
                patronId: pid,
                dept: b.dept,
                ptype: p.type,
                checkout: todayStr(),
                due: due,
                returned: null,
                status: "active",
                renewals: 0,
                fineAssessed: 0,
              };
              DB.add("loans", loan);
              syncAvailability(bid);
              const rsv = DB.get("reservations").find(
                (r) =>
                  r.bookId === bid &&
                  r.patronId === pid &&
                  ["pending", "approved", "ready"].includes(r.status),
              );
              if (rsv)
                DB.update("reservations", rsv.id, {
                  status: "collected",
                  note: "Fulfilled via checkout " + loan.id,
                });
              DB.audit(
                "Checkout",
                "Circulation",
                loan.id + " — " + b.title + " to " + p.name,
              );
              logActivity(
                trunc(b.title, 40) + " checked out to " + p.name,
                "checkout",
              );
              UI.toast("Checkout complete — due " + fmtDate(due), "success");
              App.rerender();
            };
          }
          function checkinTab() {
            document.getElementById("circ-body").innerHTML =
              '<div class="card" id="ci-tbl"></div>';
            UI.renderTable("#ci-tbl", {
              columns: [
                { key: "id", label: "Loan #" },
                {
                  key: "bookId",
                  label: "Book",
                  render: (l) =>
                    '<div class="font-semibold">' +
                    esc(trunc(bookTitle(l.bookId), 44)) +
                    '</div><div class="text-[11px] text-muted">' +
                    (bookById(l.bookId) || {}).callNo +
                    "</div>",
                },
                {
                  key: "patronId",
                  label: "Borrower",
                  render: (l) => esc(patronName(l.patronId)),
                },
                {
                  key: "dept",
                  label: "Dept",
                  render: (l) => UI.deptBadge(l.dept),
                  cls: "hidden md:table-cell",
                },
                {
                  key: "checkout",
                  label: "Checked out",
                  render: (l) => fmtDate(l.checkout),
                  cls: "hidden lg:table-cell",
                },
                { key: "due", label: "Due", render: (l) => fmtDate(l.due) },
                {
                  key: "status",
                  label: "Status",
                  render: (l) => UI.statusBadge(loanStatus(l)),
                },
                {
                  key: "late",
                  label: "Fine if returned now",
                  render: (l) => {
                    const late = daysLate(l.due);
                    return late > 0
                      ? '<span class="font-semibold text-red-700">' +
                          money(late * settings().finePerDay) +
                          '</span> <span class="text-[11px] text-muted">(' +
                          late +
                          "d)</span>"
                      : '<span class="text-muted">—</span>';
                  },
                },
              ],
              rows: () =>
                DB.get("loans").filter((l) => loanStatus(l) !== "returned"),
              searchKeys: ["id"],
              deptScope: true,
              searchPlaceholder: "Search by loan #…",
              emptyText: "No items are currently on loan",
              actions: [
                {
                  icon: "undo-2",
                  label: "Check in",
                  onClick: (l) =>
                    UI.confirm({
                      title: "Check in item",
                      message:
                        "Confirm return of <strong>" +
                        esc(trunc(bookTitle(l.bookId), 48)) +
                        "</strong> from " +
                        esc(patronName(l.patronId)) +
                        "?",
                      danger: false,
                      confirmText: "Check in",
                      onConfirm: function () {
                        const late = daysLate(l.due);
                        const S = settings();
                        DB.update("loans", l.id, {
                          returned: todayStr(),
                          status: "returned",
                          fineAssessed: late > 0 ? late * S.finePerDay : 0,
                        });
                        syncAvailability(l.bookId);
                        DB.audit(
                          "Check-in",
                          "Circulation",
                          l.id +
                            " returned" +
                            (late > 0 ? " (" + late + " days late)" : ""),
                        );
                        logActivity(
                          trunc(bookTitle(l.bookId), 40) +
                            " returned by " +
                            patronName(l.patronId),
                          "return",
                        );
                        const q = DB.get("reservations")
                          .filter(
                            (r) =>
                              r.bookId === l.bookId && r.status === "pending",
                          )
                          .sort((a, b) => a.date.localeCompare(b.date))[0];
                        if (q) {
                          DB.update("reservations", q.id, {
                            status: "ready",
                            note:
                              "Copy held for pickup — " + fmtDate(todayStr()),
                          });
                          UI.toast(
                            "Returned. Reservation for " +
                              patronName(q.patronId) +
                              " is now ready for pickup",
                            "info",
                          );
                        }
                        if (late > 0) {
                          UI.toast(
                            "Checked in — " +
                              late +
                              " days late. Fine of " +
                              money(late * S.finePerDay) +
                              " assessed.",
                            "warning",
                          );
                        } else UI.toast("Checked in successfully", "success");
                        App.rerender();
                      },
                    }),
                },
              ],
            });
          }
          function loansTab() {
            document.getElementById("circ-body").innerHTML =
              '<div class="card" id="cl-tbl"></div>';
            const S = settings();
            UI.renderTable("#cl-tbl", {
              columns: [
                { key: "id", label: "Loan #" },
                {
                  key: "bookId",
                  label: "Book",
                  render: (l) => esc(trunc(bookTitle(l.bookId), 44)),
                },
                {
                  key: "patronId",
                  label: "Borrower",
                  render: (l) =>
                    '<div class="font-medium">' +
                    esc(patronName(l.patronId)) +
                    '</div><div class="text-[11px] text-muted">' +
                    esc((patronById(l.patronId) || {}).no || "") +
                    "</div>",
                },
                {
                  key: "due",
                  label: "Due date",
                  render: (l) =>
                    fmtDate(l.due) +
                    (l.renewals
                      ? ' <span class="text-[10px] text-muted">(renewed ×' +
                        l.renewals +
                        ")</span>"
                      : ""),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (l) => UI.statusBadge(loanStatus(l)),
                },
                {
                  key: "renew",
                  label: "Renewal",
                  render: (l) => {
                    const canRenew =
                      loanStatus(l) !== "overdue" &&
                      l.renewals < S.maxRenewals &&
                      !DB.get("reservations").some(
                        (r) =>
                          r.bookId === l.bookId &&
                          ["pending", "approved"].includes(r.status),
                      );
                    return (
                      '<button class="btn btn-sm ' +
                      (canRenew ? "btn-outline" : "btn-ghost") +
                      '" data-renew="' +
                      l.id +
                      '" ' +
                      (canRenew ? "" : 'disabled title="Not eligible"') +
                      '><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Renew</button>'
                    );
                  },
                },
              ],
              rows: () =>
                DB.get("loans").filter((l) => loanStatus(l) !== "returned"),
              searchKeys: ["id"],
              searchPlaceholder: "Search loans…",
              emptyText: "No current loans",
              filters: [
                {
                  key: "status",
                  label: "Any status",
                  options: [
                    { v: "active", l: "Active" },
                    { v: "overdue", l: "Overdue" },
                  ],
                },
              ],
            });
            document
              .querySelectorAll("#cl-tbl [data-renew]")
              .forEach(function (b) {
                b.onclick = function () {
                  renewLoan(this.dataset.renew);
                };
              });
          }
          function historyTab() {
            document.getElementById("circ-body").innerHTML =
              '<div class="card" id="ch-tbl"></div>';
            UI.renderTable("#ch-tbl", {
              columns: [
                { key: "id", label: "Loan #" },
                {
                  key: "bookId",
                  label: "Book",
                  render: (l) => esc(trunc(bookTitle(l.bookId), 40)),
                },
                {
                  key: "patronId",
                  label: "Borrower",
                  render: (l) => esc(patronName(l.patronId)),
                },
                {
                  key: "dept",
                  label: "Dept",
                  render: (l) => UI.deptBadge(l.dept),
                  cls: "hidden md:table-cell",
                },
                {
                  key: "checkout",
                  label: "Checkout",
                  render: (l) => fmtDate(l.checkout),
                  cls: "hidden lg:table-cell",
                },
                { key: "due", label: "Due", render: (l) => fmtDate(l.due) },
                {
                  key: "returned",
                  label: "Returned",
                  render: (l) => fmtDate(l.returned),
                },
                {
                  key: "fine",
                  label: "Fine",
                  render: (l) => {
                    const f = l.fineAssessed || 0;
                    const pd = paidFor(l.id);
                    return f > 0
                      ? money(f) +
                          ' <span class="text-[11px] ' +
                          (pd >= f ? "text-green-700" : "text-red-700") +
                          '">' +
                          (pd >= f ? "paid" : "due " + money(f - pd)) +
                          "</span>"
                      : '<span class="text-muted">—</span>';
                  },
                },
              ],
              rows: () => DB.get("loans").filter((l) => l.returned),
              searchKeys: ["id"],
              searchPlaceholder: "Search history…",
              sortKey: "returned",
              sortDir: "desc",
              toolbarExtra:
                '<button class="btn btn-outline btn-sm ml-auto" id="ch-export"><i data-lucide="download" class="w-3.5 h-3.5"></i> Export CSV</button>',
            });
            const ex = document.getElementById("ch-export");
            if (ex)
              ex.onclick = function () {
                const rows = DB.get("loans")
                  .filter((l) => l.returned)
                  .map((l) => ({
                    loan: l.id,
                    book: bookTitle(l.bookId),
                    patron: patronName(l.patronId),
                    dept: l.dept,
                    checkout: l.checkout,
                    due: l.due,
                    returned: l.returned,
                    fine: l.fineAssessed || 0,
                  }));
                UI.exportCSV("loan_history", rows);
              };
          }
          const tabs = {
            checkout: checkoutTab,
            checkin: checkinTab,
            loans: loansTab,
            history: historyTab,
          };
          checkoutTab();
          document
            .querySelectorAll("#circ-tabs .tab-btn")
            .forEach(function (b) {
              b.onclick = function () {
                document
                  .querySelectorAll("#circ-tabs .tab-btn")
                  .forEach((x) => x.classList.remove("active"));
                b.classList.add("active");
                tabs[b.dataset.t]();
                lucide.createIcons();
              };
            });
        };
        function renewLoan(id) {
          const l = DB.get("loans").find((x) => x.id === id);
          if (!l) return;
          const S = settings();
          if (loanStatus(l) === "overdue") {
            UI.toast(
              "Overdue items cannot be renewed — return the book and settle the fine",
              "error",
            );
            return;
          }
          if (l.renewals >= S.maxRenewals) {
            UI.toast(
              "Maximum renewals (" + S.maxRenewals + ") reached",
              "error",
            );
            return;
          }
          if (
            DB.get("reservations").some(
              (r) =>
                r.bookId === l.bookId &&
                ["pending", "approved"].includes(r.status),
            )
          ) {
            UI.toast(
              "Another patron is waiting for this title — renewal blocked",
              "error",
            );
            return;
          }
          const p = patronById(l.patronId);
          const days =
            p && p.type !== "student" ? S.loanDaysFaculty : S.loanDaysStudent;
          DB.update("loans", id, {
            due: dateAdd(l.due, days),
            renewals: l.renewals + 1,
          });
          DB.audit(
            "Renew",
            "Circulation",
            id + " renewed (×" + (l.renewals + 1) + ")",
          );
          UI.toast(
            "Renewed — new due date " + fmtDate(dateAdd(l.due, days)),
            "success",
          );
          App.rerender();
        }

        /* ---------- Module 8: Reservations & Holds ---------- */
        Modules.reservations = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Reservations & Holds",
              desc: "Manage the reservation queue — pending holds, ready-for-pickup shelves, expirations and collection.",
              actions: [
                {
                  label: "New Reservation",
                  icon: "bookmark-plus",
                  cls: "btn-primary",
                  minLevel: 1,
                  onclick: "rsvNew()",
                },
              ],
            }) +
            '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5" id="rsv-cards"></div>' +
            '<div class="card" id="rsv-tbl"></div>';
          lucide.createIcons();
          const rs = DB.get("reservations").filter(
            (r) => Session.dept() === "all" || r.dept === Session.dept(),
          );
          const cnt = (s) => rs.filter((r) => r.status === s).length;
          document.getElementById("rsv-cards").innerHTML =
            UI.statCard({
              label: "Pending",
              value: cnt("pending"),
              icon: "clock",
              tone: "amber",
              sub: "awaiting approval",
            }) +
            UI.statCard({
              label: "Approved",
              value: cnt("approved"),
              icon: "check",
              tone: "blue",
              sub: "copy being pulled",
            }) +
            UI.statCard({
              label: "Ready for pickup",
              value: cnt("ready"),
              icon: "package",
              tone: "green",
              sub: "on the hold shelf",
            }) +
            UI.statCard({
              label: "Expired / cancelled",
              value: cnt("expired") + cnt("cancelled"),
              icon: "x-circle",
              tone: "red",
              sub: "this term",
            });
          UI.renderTable("#rsv-tbl", {
            columns: [
              { key: "id", label: "Hold #" },
              {
                key: "bookId",
                label: "Book",
                render: (r) =>
                  '<div class="font-semibold">' +
                  esc(trunc(bookTitle(r.bookId), 42)) +
                  '</div><div class="text-[11px] text-muted">' +
                  (bookById(r.bookId) || {}).callNo +
                  "</div>",
              },
              {
                key: "patronId",
                label: "Patron",
                render: (r) =>
                  '<div class="font-medium">' +
                  esc(patronName(r.patronId)) +
                  '</div><div class="text-[11px] text-muted">' +
                  esc((patronById(r.patronId) || {}).no || "") +
                  "</div>",
              },
              {
                key: "dept",
                label: "Dept",
                render: (r) => UI.deptBadge(r.dept),
                cls: "hidden lg:table-cell",
              },
              { key: "date", label: "Placed", render: (r) => fmtDate(r.date) },
              {
                key: "queue",
                label: "Queue",
                render: (r) => {
                  const q = DB.get("reservations")
                    .filter(
                      (x) => x.bookId === r.bookId && x.status === "pending",
                    )
                    .sort((a, b) => a.date.localeCompare(b.date));
                  const pos = q.findIndex((x) => x.id === r.id) + 1;
                  return pos > 0
                    ? UI.badge("#" + pos + " in queue", "gray")
                    : UI.badge("—", "gray");
                },
              },
              {
                key: "status",
                label: "Status",
                render: (r) =>
                  UI.statusBadge(r.status) +
                  (r.note
                    ? '<div class="text-[11px] text-muted mt-0.5">' +
                      esc(r.note) +
                      "</div>"
                    : ""),
              },
            ],
            rows: () => DB.get("reservations"),
            searchKeys: ["id"],
            searchPlaceholder: "Search by hold #…",
            filters: [
              {
                key: "status",
                label: "All statuses",
                options: [
                  { v: "pending", l: "Pending" },
                  { v: "approved", l: "Approved" },
                  { v: "ready", l: "Ready for pickup" },
                  { v: "collected", l: "Collected" },
                  { v: "expired", l: "Expired" },
                  { v: "cancelled", l: "Cancelled" },
                ],
              },
            ],
            actions: [
              {
                icon: "check",
                label: "Approve",
                show: (r) => r.status === "pending" && Session.atLeast(1),
                onClick: (r) => {
                  DB.update("reservations", r.id, {
                    status: "approved",
                    note:
                      "Approved by " +
                      Session.user().name.replace(/(Dr\.|Ms\.|Mr\.)\s*/, ""),
                  });
                  DB.audit("Approve", "Reservations", r.id);
                  UI.toast("Reservation approved", "success");
                  App.rerender();
                },
              },
              {
                icon: "package",
                label: "Mark ready",
                show: (r) => r.status === "approved" && Session.atLeast(1),
                onClick: (r) => {
                  DB.update("reservations", r.id, {
                    status: "ready",
                    note:
                      "On hold shelf — expires in " +
                      settings().holdDays +
                      " days",
                  });
                  logActivity(
                    "Reservation ready for pickup: " +
                      trunc(bookTitle(r.bookId), 36),
                    "reservation",
                  );
                  UI.toast(
                    "Moved to hold shelf — patron notified (simulated)",
                    "success",
                  );
                  App.rerender();
                },
              },
              {
                icon: "hand",
                label: "Hand over",
                show: (r) => r.status === "ready",
                onClick: (r) =>
                  UI.confirm({
                    title: "Hand over to patron",
                    message:
                      "Confirm that <strong>" +
                      esc(patronName(r.patronId)) +
                      "</strong> collected <strong>" +
                      esc(trunc(bookTitle(r.bookId), 40)) +
                      "</strong>?",
                    danger: false,
                    confirmText: "Confirm pickup",
                    onConfirm: function () {
                      DB.update("reservations", r.id, {
                        status: "collected",
                        note: "Collected " + fmtDate(todayStr()),
                      });
                      DB.audit("Collect", "Reservations", r.id);
                      UI.toast("Reservation fulfilled", "success");
                      App.rerender();
                    },
                  }),
              },
              {
                icon: "x",
                label: "Cancel",
                danger: true,
                show: (r) =>
                  ["pending", "approved", "ready"].includes(r.status),
                onClick: (r) =>
                  UI.confirm({
                    title: "Cancel reservation",
                    message:
                      "Cancel hold " +
                      r.id +
                      " for " +
                      esc(patronName(r.patronId)) +
                      "?",
                    confirmText: "Cancel hold",
                    onConfirm: function () {
                      DB.update("reservations", r.id, {
                        status: "cancelled",
                        note: "Cancelled by staff",
                      });
                      DB.audit("Cancel", "Reservations", r.id);
                      UI.toast("Reservation cancelled", "info");
                      App.rerender();
                    },
                  }),
              },
            ],
          });
        };
        window.rsvNew = function () {
          const pats = scopedPatrons().filter((p) => p.status === "active");
          UI.formModal({
            title: "New reservation",
            subtitle: "Place a hold on behalf of a patron",
            icon: "bookmark-plus",
            submitText: "Place hold",
            fields: [
              {
                name: "patronId",
                label: "Patron",
                type: "select",
                required: true,
                span: 2,
                placeholder: "Select patron…",
                options: pats.map((p) => ({
                  v: p.id,
                  l: p.name + " — " + p.no,
                })),
              },
              {
                name: "bookId",
                label: "Book",
                type: "select",
                required: true,
                span: 2,
                placeholder: "Select title…",
                options: DB.get("books").map((b) => ({
                  v: b.id,
                  l: trunc(b.title, 48) + " — " + b.callNo,
                })),
              },
              { name: "note", label: "Note", type: "textarea", span: 2 },
            ],
            onSubmit: function (v, close) {
              const b = bookById(v.bookId);
              const dup = DB.get("reservations").find(
                (r) =>
                  r.bookId === v.bookId &&
                  r.patronId === v.patronId &&
                  ["pending", "approved", "ready"].includes(r.status),
              );
              if (dup) {
                UI.toast(
                  "This patron already has an active hold on this title",
                  "error",
                );
                return;
              }
              if (
                DB.get("loans").some(
                  (l) =>
                    l.bookId === v.bookId &&
                    l.patronId === v.patronId &&
                    loanStatus(l) !== "returned",
                )
              ) {
                UI.toast("Patron currently has this title on loan", "error");
                return;
              }
              DB.add("reservations", {
                id: uid("RSV"),
                bookId: v.bookId,
                patronId: v.patronId,
                dept: b.dept,
                date: todayStr(),
                status: "pending",
                note: v.note || "",
              });
              DB.audit(
                "Create",
                "Reservations",
                "Hold on " + v.bookId + " for " + v.patronId,
              );
              close();
              UI.toast("Hold placed — added to queue", "success");
              App.rerender();
            },
          });
        };

        /* ---------- Module 9: Fines & Payments ---------- */
        function fineRows() {
          const S = settings();
          const rows = [];
          DB.get("loans").forEach(function (l) {
            const late = daysLate(l.due, l.returned || todayStr());
            if (late <= 0) return;
            const amount =
              l.returned && l.fineAssessed
                ? l.fineAssessed
                : late * S.finePerDay;
            rows.push({
              ref: l.id,
              type: "Overdue",
              date: l.due,
              patronId: l.patronId,
              bookId: l.bookId,
              dept: l.dept,
              amount: amount,
              detail: l.returned
                ? "Returned " + late + " day(s) late"
                : "Overdue since " + fmtDate(l.due) + " (" + late + " days)",
            });
          });
          DB.get("fines").forEach(function (f) {
            const b = bookById(f.bookId);
            rows.push({
              ref: f.id,
              type: f.type === "lost" ? "Lost book" : "Damaged book",
              date: f.date,
              patronId: f.patronId,
              bookId: f.bookId,
              dept: b ? b.dept : "college",
              amount: f.amount,
              detail: f.note,
            });
          });
          rows.forEach(function (r) {
            r.paid = paidFor(r.ref);
            r.balance = Math.max(0, r.amount - r.paid);
            r.status =
              r.balance <= 0 ? "paid" : r.paid > 0 ? "partial" : "outstanding";
            r.patron = patronName(r.patronId);
            r.book = bookTitle(r.bookId);
          });
          return rows;
        }
        Modules.fines = function (el) {
          const rows = fineRows().filter(
            (r) => Session.dept() === "all" || r.dept === Session.dept(),
          );
          const outstanding = rows.reduce((s, r) => s + r.balance, 0);
          const collected = DB.get("payments")
            .filter((p) => p.date.slice(0, 7) === todayStr().slice(0, 7))
            .reduce((s, p) => s + Number(p.amount), 0);
          el.innerHTML =
            UI.pageHead({
              title: "Fines & Payments",
              desc: "Overdue, lost and damaged book charges — payment recording and printable receipts. All payment processing is simulated; no real payment gateway is connected.",
              actions: [
                {
                  label: "Fine policy",
                  icon: "scale",
                  cls: "btn-outline",
                  onclick: "location.hash='#/services'",
                },
              ],
            }) +
            '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">' +
            UI.statCard({
              label: "Outstanding balance",
              value: money(outstanding),
              icon: "alert-circle",
              tone: "red",
              sub: rows.filter((r) => r.balance > 0).length + " unpaid charges",
            }) +
            UI.statCard({
              label: "Collected (Nov 2026)",
              value: money(collected),
              icon: "banknote",
              tone: "green",
              sub: "simulated payments",
            }) +
            UI.statCard({
              label: "Fine rate",
              value: money(settings().finePerDay) + "/day",
              icon: "percent",
              tone: "maroon",
              sub: "per overdue item",
            }) +
            UI.statCard({
              label: "Overdue items",
              value: DB.get("loans").filter((l) => loanStatus(l) === "overdue")
                .length,
              icon: "clock",
              tone: "amber",
              sub: "accruing fines daily",
            }) +
            "</div>" +
            '<div class="card mb-5" id="fine-tbl"></div>' +
            '<div class="card"><div class="p-4 border-b border-ink/8"><h3 class="font-serif font-bold">Payment history</h3></div><div id="pay-tbl"></div></div>';
          lucide.createIcons();
          UI.renderTable("#fine-tbl", {
            columns: [
              { key: "ref", label: "Reference" },
              {
                key: "type",
                label: "Charge type",
                render: (r) =>
                  UI.badge(
                    r.type,
                    r.type === "Overdue"
                      ? "amber"
                      : r.type === "Lost book"
                        ? "red"
                        : "orange",
                  ),
              },
              {
                key: "patron",
                label: "Patron",
                render: (r) =>
                  '<div class="font-medium">' +
                  esc(r.patron) +
                  '</div><div class="text-[11px] text-muted">' +
                  esc((patronById(r.patronId) || {}).no || "") +
                  "</div>",
              },
              {
                key: "book",
                label: "Book",
                render: (r) => esc(trunc(r.book, 38)),
                cls: "hidden md:table-cell",
              },
              {
                key: "detail",
                label: "Detail",
                render: (r) =>
                  '<span class="text-xs text-muted">' +
                  esc(r.detail) +
                  "</span>",
                cls: "hidden lg:table-cell",
              },
              {
                key: "amount",
                label: "Amount",
                render: (r) => money(r.amount),
              },
              {
                key: "balance",
                label: "Balance",
                render: (r) =>
                  r.balance > 0
                    ? '<span class="font-bold text-red-700">' +
                      money(r.balance) +
                      "</span>"
                    : '<span class="text-green-700 font-semibold">Settled</span>',
              },
              {
                key: "status",
                label: "Status",
                render: (r) => UI.statusBadge(r.status),
              },
            ],
            rows: rows,
            deptScope: false,
            searchKeys: ["ref", "patron", "book"],
            searchPlaceholder: "Search fines…",
            filters: [
              {
                key: "status",
                label: "Any status",
                options: [
                  { v: "outstanding", l: "Outstanding" },
                  { v: "partial", l: "Partially paid" },
                  { v: "paid", l: "Paid" },
                ],
              },
            ],
            actions: [
              {
                icon: "banknote",
                label: "Record payment",
                show: (r) => r.balance > 0,
                onClick: (r) => payFine(r),
              },
              { icon: "printer", label: "Receipt", onClick: (r) => receipt(r) },
              {
                icon: "trash-2",
                label: "Waive / delete charge",
                danger: true,
                show: (r) => r.ref.startsWith("FIN") && Session.atLeast(3),
                onClick: (r) =>
                  UI.confirm({
                    title: "Delete charge",
                    message:
                      "Remove charge " +
                      r.ref +
                      "? (Overdue fines are computed from loans and cannot be deleted here.)",
                    confirmText: "Delete",
                    onConfirm: function () {
                      DB.remove("fines", r.ref);
                      DB.audit("Delete", "Fines", r.ref + " removed");
                      UI.toast("Charge removed", "success");
                      App.rerender();
                    },
                  }),
              },
            ],
          });
          UI.renderTable("#pay-tbl", {
            columns: [
              { key: "id", label: "Payment #" },
              {
                key: "or",
                label: "OR number",
                render: (p) =>
                  '<span class="chip-code">' + esc(p.or) + "</span>",
              },
              { key: "ref", label: "For charge" },
              {
                key: "amount",
                label: "Amount",
                render: (p) =>
                  '<span class="font-semibold text-green-700">' +
                  money(p.amount) +
                  "</span>",
              },
              {
                key: "method",
                label: "Method",
                render: (p) => UI.badge(p.method, "blue"),
              },
              { key: "date", label: "Date", render: (p) => fmtDate(p.date) },
              {
                key: "cashier",
                label: "Received by",
                cls: "hidden md:table-cell",
              },
            ],
            rows: () => DB.get("payments"),
            deptScope: false,
            searchKeys: ["id", "or", "ref"],
            pageSize: 6,
            searchPlaceholder: "Search payments…",
            sortKey: "date",
            sortDir: "desc",
          });
        };
        function payFine(r) {
          UI.formModal({
            title: "Record payment",
            subtitle:
              "Reference " +
              r.ref +
              " · balance " +
              money(r.balance) +
              " — SIMULATED payment processing",
            icon: "banknote",
            submitText: "Record payment",
            values: {
              amount: r.balance,
              method: "Cash",
              or: "OR-" + Math.floor(10235 + DB.get("payments").length),
            },
            fields: [
              {
                name: "amount",
                label: "Amount received (₱)",
                type: "number",
                min: 0.01,
                required: true,
              },
              {
                name: "method",
                label: "Payment method",
                type: "select",
                options: ["Cash", "GCash", "Maya", "Bank transfer"],
              },
              { name: "or", label: "OR / reference number", required: true },
              {
                name: "patronStatic",
                label: "Patron",
                type: "static",
                value: esc(r.patron),
              },
              {
                name: "note",
                label: "Note",
                type: "textarea",
                span: 2,
                placeholder: "Optional",
              },
            ],
            onSubmit: function (v, close) {
              const amt = Number(v.amount);
              if (amt <= 0 || amt > r.balance + 0.001) {
                UI.toast(
                  "Amount must be between ₱0.01 and " + money(r.balance),
                  "error",
                );
                return;
              }
              const pay = {
                id: uid("PAY"),
                ref: r.ref,
                amount: amt,
                date: todayStr(),
                method: v.method,
                or: v.or,
                cashier: Session.user().name.replace(/(Dr\.|Ms\.|Mr\.)\s*/, ""),
              };
              DB.add("payments", pay);
              DB.audit(
                "Record payment",
                "Fines",
                pay.id + " — " + money(amt) + " for " + r.ref,
              );
              logActivity(
                "Payment " + money(amt) + " recorded for " + r.patron,
                "payment",
              );
              close();
              UI.toast("Payment recorded (simulated)", "success");
              receipt(
                Object.assign({}, r, {
                  paid: r.paid + amt,
                  balance: Math.max(0, r.balance - amt),
                  lastPayment: pay,
                }),
              );
              App.rerender();
            },
          });
        }
        function receipt(r) {
          const pays = DB.get("payments").filter((p) => p.ref === r.ref);
          const body =
            '<div class="receipt" id="receipt-area">' +
            '<h4>University of Saint Anthony</h4><div class="text-center text-[11px]">University Library System · Iriga City</div>' +
            '<div class="text-center font-bold mt-1">OFFICIAL RECEIPT <span class="sim-tag ml-1">Simulated</span></div><hr>' +
            '<div class="rline"><span>Receipt no.</span><span>' +
            (pays.length ? esc(pays[pays.length - 1].or) : "—") +
            "</span></div>" +
            '<div class="rline"><span>Date</span><span>' +
            fmtDate(todayStr()) +
            "</span></div>" +
            '<div class="rline"><span>Patron</span><span>' +
            esc(r.patron || patronName(r.patronId)) +
            "</span></div>" +
            '<div class="rline"><span>Charge ref.</span><span>' +
            esc(r.ref) +
            "</span></div><hr>" +
            '<div class="rline"><span>' +
            esc(r.type) +
            " — " +
            esc(trunc(r.book || bookTitle(r.bookId), 26)) +
            "</span><span>" +
            money(r.amount) +
            "</span></div>" +
            pays
              .map(
                (p) =>
                  '<div class="rline text-green-800"><span>Payment (' +
                  esc(p.method) +
                  ", " +
                  fmtDate(p.date) +
                  ")</span><span>-" +
                  money(p.amount) +
                  "</span></div>",
              )
              .join("") +
            '<hr><div class="rline font-bold"><span>BALANCE</span><span>' +
            money(Math.max(0, r.amount - r.paid)) +
            "</span></div>" +
            '<div class="text-center text-[10px] mt-3">This receipt was generated by a frontend prototype.<br>No real money was processed.</div></div>';
          UI.modal({
            title: "Payment receipt",
            size: "sm",
            body: body,
            footer:
              '<button class="btn btn-outline" onclick="document.getElementById(\'modal-root\').innerHTML=\'\'">Close</button><button class="btn btn-primary" onclick="window.print()"><i data-lucide="printer" class="w-4 h-4"></i> Print receipt</button>',
          });
        }

        /* ---------- Module 18: Facilities & Equipment Reservations ---------- */
        Modules.facilities = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Facilities & Equipment Reservations",
              desc: "Study rooms, discussion rooms, computer stations and equipment — schedules, approvals and booking history.",
              actions: [
                {
                  label: "New Booking",
                  icon: "calendar-plus",
                  cls: "btn-primary",
                  onclick: "bkNew()",
                },
              ],
            }) +
            '<div class="tabs mb-5" id="fac-tabs"><button class="tab-btn active" data-t="today">Today’s schedule</button><button class="tab-btn" data-t="resources">Resources</button><button class="tab-btn" data-t="bookings">All bookings</button></div><div id="fac-body"></div>';
          lucide.createIcons();
          const resIcon = {
            "study-room": "door-closed",
            "discussion-room": "users-round",
            computer: "monitor",
            equipment: "projector",
          };
          function todayTab() {
            const bks = DB.get("bookings").filter(
              (b) => b.date === todayStr() && b.status !== "cancelled",
            );
            const resources = DB.get("facilities").filter(
              (f) => Session.dept() === "all" || f.dept === Session.dept(),
            );
            document.getElementById("fac-body").innerHTML =
              '<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">' +
              resources
                .map(function (f) {
                  const fb = bks
                    .filter((b) => b.resourceId === f.id)
                    .sort((a, b) => a.start.localeCompare(b.start));
                  return (
                    '<div class="card p-4"><div class="flex items-center gap-3 mb-3"><span class="stat-ic" style="background:#F6E7E7;color:#7D1519"><i data-lucide="' +
                    (resIcon[f.type] || "door-open") +
                    '" class="w-5 h-5"></i></span><div><div class="font-semibold text-sm">' +
                    esc(f.name) +
                    '</div><div class="text-[11px] text-muted">' +
                    esc(f.location) +
                    " · capacity " +
                    f.capacity +
                    "</div></div>" +
                    UI.statusBadge(
                      f.status === "active" ? "active" : "maintenance",
                    ) +
                    "</div>" +
                    (fb.length
                      ? '<div class="space-y-1.5">' +
                        fb
                          .map(
                            (b) =>
                              '<div class="flex items-center gap-2 text-xs bg-warm rounded-lg px-2.5 py-1.5"><span class="font-mono font-semibold text-maroon">' +
                              b.start +
                              "–" +
                              b.end +
                              '</span><span class="truncate">' +
                              esc(patronName(b.patronId)) +
                              "</span>" +
                              UI.statusBadge(b.status) +
                              "</div>",
                          )
                          .join("") +
                        "</div>"
                      : '<div class="text-xs text-muted italic">No bookings today — available all day</div>') +
                    "</div>"
                  );
                })
                .join("") +
              "</div>";
            lucide.createIcons();
          }
          function resourcesTab() {
            document.getElementById("fac-body").innerHTML =
              '<div class="card" id="fac-res"></div>';
            UI.renderTable("#fac-res", {
              columns: [
                {
                  key: "name",
                  label: "Resource",
                  render: (f) =>
                    '<div class="font-semibold">' +
                    esc(f.name) +
                    '</div><div class="text-[11px] text-muted">' +
                    esc(f.location) +
                    "</div>",
                },
                {
                  key: "type",
                  label: "Type",
                  render: (f) => UI.badge(f.type.replace(/-/g, " "), "gold"),
                },
                { key: "capacity", label: "Capacity" },
                {
                  key: "dept",
                  label: "Department",
                  render: (f) => UI.deptBadge(f.dept),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (f) =>
                    UI.statusBadge(
                      f.status === "active" ? "active" : "maintenance",
                    ),
                },
              ],
              rows: () => DB.get("facilities"),
              searchKeys: ["name", "location"],
              searchPlaceholder: "Search resources…",
              deptScope: false,
              filters: [
                {
                  key: "type",
                  label: "All types",
                  options: [
                    { v: "study-room", l: "Study rooms" },
                    { v: "discussion-room", l: "Discussion rooms" },
                    { v: "computer", l: "Computers" },
                    { v: "equipment", l: "Equipment" },
                  ],
                },
              ],
              actions: [
                {
                  icon: "calendar-plus",
                  label: "Book",
                  onClick: (f) => bkNew(f.id),
                },
                {
                  icon: "wrench",
                  label: "Toggle availability",
                  show: () => Session.atLeast(2),
                  onClick: (f) => {
                    DB.update("facilities", f.id, {
                      status: f.status === "active" ? "maintenance" : "active",
                    });
                    UI.toast("Resource status updated", "info");
                    App.rerender();
                  },
                },
              ],
            });
          }
          function bookingsTab() {
            document.getElementById("fac-body").innerHTML =
              '<div class="card" id="fac-bk"></div>';
            UI.renderTable("#fac-bk", {
              columns: [
                { key: "id", label: "Booking #" },
                {
                  key: "resourceId",
                  label: "Resource",
                  render: (b) =>
                    esc(
                      (
                        DB.get("facilities").find(
                          (f) => f.id === b.resourceId,
                        ) || {}
                      ).name || b.resourceId,
                    ),
                },
                {
                  key: "patronId",
                  label: "Booked by",
                  render: (b) => esc(patronName(b.patronId)),
                },
                { key: "date", label: "Date", render: (b) => fmtDate(b.date) },
                {
                  key: "start",
                  label: "Time",
                  render: (b) =>
                    '<span class="font-mono text-xs">' +
                    b.start +
                    " – " +
                    b.end +
                    "</span>",
                },
                {
                  key: "purpose",
                  label: "Purpose",
                  render: (b) =>
                    '<span class="text-xs text-muted">' +
                    esc(b.purpose || "") +
                    "</span>",
                  cls: "hidden md:table-cell",
                },
                {
                  key: "status",
                  label: "Status",
                  render: (b) => UI.statusBadge(b.status),
                },
              ],
              rows: () => DB.get("bookings"),
              searchKeys: ["id", "purpose"],
              searchPlaceholder: "Search bookings…",
              deptScope: false,
              sortKey: "date",
              sortDir: "desc",
              filters: [
                {
                  key: "status",
                  label: "Any status",
                  options: [
                    { v: "pending", l: "Pending" },
                    { v: "approved", l: "Approved" },
                    { v: "rejected", l: "Rejected" },
                    { v: "completed", l: "Completed" },
                    { v: "cancelled", l: "Cancelled" },
                  ],
                },
              ],
              actions: [
                {
                  icon: "check",
                  label: "Approve",
                  show: (b) => b.status === "pending" && Session.atLeast(1),
                  onClick: (b) => {
                    DB.update("bookings", b.id, { status: "approved" });
                    DB.audit("Approve", "Facilities", b.id);
                    UI.toast(
                      "Booking approved — patron notified (simulated)",
                      "success",
                    );
                    App.rerender();
                  },
                },
                {
                  icon: "x",
                  label: "Reject",
                  danger: true,
                  show: (b) => b.status === "pending" && Session.atLeast(1),
                  onClick: (b) => {
                    DB.update("bookings", b.id, { status: "rejected" });
                    UI.toast("Booking rejected", "info");
                    App.rerender();
                  },
                },
                {
                  icon: "flag",
                  label: "Mark completed",
                  show: (b) => b.status === "approved",
                  onClick: (b) => {
                    DB.update("bookings", b.id, { status: "completed" });
                    UI.toast("Booking completed", "success");
                    App.rerender();
                  },
                },
                {
                  icon: "ban",
                  label: "Cancel",
                  danger: true,
                  show: (b) => ["pending", "approved"].includes(b.status),
                  onClick: (b) =>
                    UI.confirm({
                      title: "Cancel booking",
                      message: "Cancel booking " + b.id + "?",
                      confirmText: "Cancel booking",
                      onConfirm: function () {
                        DB.update("bookings", b.id, { status: "cancelled" });
                        UI.toast("Booking cancelled", "info");
                        App.rerender();
                      },
                    }),
                },
              ],
            });
          }
          const tabs = {
            today: todayTab,
            resources: resourcesTab,
            bookings: bookingsTab,
          };
          todayTab();
          document.querySelectorAll("#fac-tabs .tab-btn").forEach(function (b) {
            b.onclick = function () {
              document
                .querySelectorAll("#fac-tabs .tab-btn")
                .forEach((x) => x.classList.remove("active"));
              b.classList.add("active");
              tabs[b.dataset.t]();
            };
          });
          window.bkNew = function (pre) {
            const pats = DB.get("patrons").filter((p) => p.status === "active");
            UI.formModal({
              title: "New facility booking",
              icon: "calendar-plus",
              submitText: "Request booking",
              values: {
                date: todayStr(),
                start: "09:00",
                end: "11:00",
                resourceId: pre || "",
              },
              fields: [
                {
                  name: "resourceId",
                  label: "Resource",
                  type: "select",
                  required: true,
                  span: 2,
                  options: DB.get("facilities")
                    .filter((f) => f.status === "active")
                    .map((f) => ({
                      v: f.id,
                      l: f.name + " (" + f.location + ")",
                    })),
                },
                {
                  name: "patronId",
                  label: "Patron",
                  type: "select",
                  required: true,
                  span: 2,
                  placeholder: "Select patron…",
                  options: pats.map((p) => ({
                    v: p.id,
                    l: p.name + " — " + p.no,
                  })),
                },
                { name: "date", label: "Date", type: "date", required: true },
                {
                  name: "start",
                  label: "Start time",
                  type: "time",
                  required: true,
                },
                {
                  name: "end",
                  label: "End time",
                  type: "time",
                  required: true,
                },
                {
                  name: "purpose",
                  label: "Purpose",
                  type: "textarea",
                  span: 2,
                },
              ],
              onSubmit: function (v, close) {
                if (v.end <= v.start) {
                  UI.toast("End time must be after start time", "error");
                  return;
                }
                const clash = DB.get("bookings").find(
                  (b) =>
                    b.resourceId === v.resourceId &&
                    b.date === v.date &&
                    ["pending", "approved"].includes(b.status) &&
                    !(v.end <= b.start || v.start >= b.end),
                );
                if (clash) {
                  UI.toast(
                    "Time slot conflicts with booking " +
                      clash.id +
                      " (" +
                      clash.start +
                      "–" +
                      clash.end +
                      ")",
                    "error",
                  );
                  return;
                }
                DB.add("bookings", {
                  id: uid("FB"),
                  resourceId: v.resourceId,
                  patronId: v.patronId,
                  date: v.date,
                  start: v.start,
                  end: v.end,
                  status: "pending",
                  purpose: v.purpose,
                });
                DB.audit(
                  "Create",
                  "Facilities",
                  "Booking " + v.resourceId + " on " + v.date,
                );
                close();
                UI.toast("Booking request submitted for approval", "success");
                App.rerender();
              },
            });
          };
        };
      })();

      /* FILE: js/modules/reports.js — Dashboard, Reports, Visitors, Monitoring, Notifications, Services, Departments, Administration, Settings, Import/Export */
      (function () {
        const MAROON = "#7D1519",
          GOLD = "#FAA61A",
          GOLD_L = "#FFD25E",
          DARK = "#2E080A";
        function deptOpts() {
          return DEPARTMENTS.map((d) => ({ v: d.id, l: d.name }));
        }
        function scoped(rows) {
          const d = Session.dept();
          return d === "all"
            ? rows
            : rows.filter((r) => (r.dept || r.libDept) === d);
        }

        /* ---------- Module 3: Dashboard ---------- */
        Modules.dashboard = function (el) {
          UI.withLoading(el, function (el) {
            const books = scoped(DB.get("books"));
            const pats = scoped(DB.get("patrons"));
            const loans = scoped(DB.get("loans"));
            const active = loans.filter((l) => loanStatus(l) === "active");
            const overdue = loans.filter((l) => loanStatus(l) === "overdue");
            const pendRes = scoped(DB.get("reservations")).filter(
              (r) => r.status === "pending",
            );
            el.innerHTML =
              UI.pageHead({
                title: "Dashboard",
                desc:
                  "Library operations overview for " +
                  (Session.dept() === "all"
                    ? "all five departments"
                    : deptName(Session.dept())) +
                  ". All figures are simulated prototype data.",
              }) +
              '<div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-4 mb-5">' +
              UI.statCard({
                label: "Total books",
                value: books.reduce((s, b) => s + b.copies, 0).toLocaleString(),
                icon: "library",
                tone: "maroon",
                sub:
                  books.length +
                  " titles · " +
                  deptShort(
                    Session.dept() === "all" ? "college" : Session.dept(),
                  ),
              }) +
              UI.statCard({
                label: "Registered patrons",
                value: pats.length,
                icon: "users",
                tone: "gold",
                sub:
                  pats.filter((p) => p.status === "active").length +
                  " active members",
              }) +
              UI.statCard({
                label: "Active loans",
                value: active.length,
                icon: "book-open",
                tone: "blue",
                sub:
                  loans.filter((l) => l.checkout === todayStr()).length +
                  " checked out today",
              }) +
              UI.statCard({
                label: "Overdue books",
                value: overdue.length,
                icon: "alert-triangle",
                tone: "red",
                sub:
                  "fines accruing at " + money(settings().finePerDay) + "/day",
              }) +
              UI.statCard({
                label: "Pending reservations",
                value: pendRes.length,
                icon: "bookmark",
                tone: "amber",
                sub: "awaiting approval",
              }) +
              UI.statCard({
                label: "Available books",
                value: books.reduce((s, b) => s + b.available, 0),
                icon: "check-circle-2",
                tone: "green",
                sub: "on shelf right now",
              }) +
              UI.statCard({
                label: "Today’s checkouts",
                value: loans.filter((l) => l.checkout === todayStr()).length,
                icon: "log-in",
                tone: "maroon",
              }) +
              UI.statCard({
                label: "Today’s returns",
                value: loans.filter((l) => l.returned === todayStr()).length,
                icon: "log-out",
                tone: "blue",
              }) +
              "</div>" +
              '<div class="card p-4 mb-5 flex flex-col md:flex-row gap-3 md:items-center bg-blue-50/50 !border-blue-200"><i data-lucide="database-zap" class="w-6 h-6 text-blue-800"></i><div class="flex-1 text-sm text-blue-950"><strong>Koha ILS integration status:</strong> <span class="badge badge-gray">Not connected — prototype</span><div class="text-xs text-blue-900/80 mt-0.5">In production, Koha will be the authoritative source for bibliographic, item, patron and circulation records. All data shown here is simulated locally.</div></div></div>' +
              '<div class="grid lg:grid-cols-3 gap-5 mb-5">' +
              '<div class="card p-4 lg:col-span-2"><div class="flex justify-between items-center mb-3"><h3 class="font-serif font-bold">Borrowing trends (12 months)</h3><span class="sim-tag">Simulated</span></div><div class="h-64"><canvas id="ch-trend"></canvas></div></div>' +
              '<div class="card p-4"><h3 class="font-serif font-bold mb-3">Collection by department</h3><div class="h-64"><canvas id="ch-dept"></canvas></div></div>' +
              "</div>" +
              '<div class="grid lg:grid-cols-3 gap-5">' +
              '<div class="card p-4"><h3 class="font-serif font-bold mb-3">This week’s circulation</h3><div class="h-52"><canvas id="ch-week"></canvas></div></div>' +
              '<div class="card p-4"><h3 class="font-serif font-bold mb-3">Popular books</h3><div class="space-y-2.5">' +
              books
                .slice()
                .sort((a, b) => b.popularity - a.popularity)
                .slice(0, 6)
                .map(function (b, i) {
                  return (
                    '<button class="w-full flex items-center gap-2.5 text-left p-1.5 rounded-lg hover:bg-warm" onclick="openBookModal(\'' +
                    b.id +
                    '\')"><span class="font-serif font-bold text-maroon w-4">' +
                    (i + 1) +
                    "</span>" +
                    UI.bookCover(b, "sm") +
                    '<span class="min-w-0"><span class="block text-[12.5px] font-semibold truncate">' +
                    esc(trunc(b.title, 36)) +
                    '</span><span class="block text-[11px] text-muted">' +
                    b.popularity +
                    " loans all-time</span></span></button>"
                  );
                })
                .join("") +
              "</div></div>" +
              '<div class="card p-4"><div class="flex justify-between items-center mb-3"><h3 class="font-serif font-bold">Recent activity</h3><a class="text-xs text-maroon font-semibold cursor-pointer" onclick="location.hash=\'#/administration\'">Audit log</a></div><div class="space-y-3 max-h-80 overflow-y-auto pr-1">' +
              DB.get("activity")
                .slice(0, 8)
                .map(function (a) {
                  const ic =
                    {
                      checkout: "log-in",
                      return: "log-out",
                      reservation: "bookmark",
                      payment: "banknote",
                      catalogue: "book-plus",
                      acquisition: "shopping-cart",
                      notification: "bell",
                      patron: "user-plus",
                      inventory: "clipboard-list",
                    }[a.type] || "activity";
                  return (
                    '<div class="flex gap-2.5"><span class="stat-ic !w-7 !h-7 !rounded-lg flex-shrink-0" style="background:#F6E7E7;color:#7D1519"><i data-lucide="' +
                    ic +
                    '" class="w-3.5 h-3.5"></i></span><div class="min-w-0"><div class="text-[12.5px] leading-snug">' +
                    esc(a.text) +
                    '</div><div class="text-[11px] text-muted">' +
                    esc(a.user) +
                    " · " +
                    timeAgo(a.ts) +
                    "</div></div></div>"
                  );
                })
                .join("") +
              "</div></div>" +
              "</div>" +
              '<div class="card mt-5"><div class="p-4 border-b border-ink/8"><h3 class="font-serif font-bold">Department statistics</h3></div><div class="overflow-x-auto"><table class="tbl w-full"><thead><tr><th>Department</th><th>Titles</th><th>Copies</th><th>Available</th><th>Patrons</th><th>Active loans</th><th>Overdue</th><th>Head librarian</th></tr></thead><tbody>' +
              DEPARTMENTS.map(function (d) {
                const bk = DB.get("books").filter((b) => b.dept === d.id);
                const ln = DB.get("loans").filter((l) => l.dept === d.id);
                return (
                  '<tr class="clickable" onclick="Session.setDept(\'' +
                  d.id +
                  "');App.rerender()\"><td>" +
                  UI.deptBadge(d.id) +
                  ' <span class="font-medium ml-1">' +
                  esc(d.name) +
                  "</span></td><td>" +
                  bk.length +
                  "</td><td>" +
                  bk.reduce((s, b) => s + b.copies, 0) +
                  '</td><td class="text-green-700 font-semibold">' +
                  bk.reduce((s, b) => s + b.available, 0) +
                  "</td><td>" +
                  DB.get("patrons").filter((p) => p.dept === d.id).length +
                  "</td><td>" +
                  ln.filter((l) => loanStatus(l) !== "returned").length +
                  '</td><td class="' +
                  (ln.some((l) => loanStatus(l) === "overdue")
                    ? "text-red-700 font-semibold"
                    : "") +
                  '">' +
                  ln.filter((l) => loanStatus(l) === "overdue").length +
                  '</td><td class="text-muted text-xs">' +
                  esc(d.head) +
                  "</td></tr>"
                );
              }).join("") +
              "</tbody></table></div></div>";
            lucide.createIcons();
            const M = DB.get("monthlyLoans");
            UI.chart("ch-trend", {
              type: "bar",
              data: {
                labels: M.labels,
                datasets: [
                  {
                    label: "Loans",
                    data: M.counts,
                    backgroundColor: MAROON,
                    borderRadius: 5,
                    maxBarThickness: 26,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, grid: { color: "#F1ECE3" } },
                  x: { grid: { display: false } },
                },
              },
            });
            const perDept = DEPARTMENTS.map((d) =>
              DB.get("books")
                .filter((b) => b.dept === d.id)
                .reduce((s, b) => s + b.copies, 0),
            );
            UI.chart("ch-dept", {
              type: "doughnut",
              data: {
                labels: DEPARTMENTS.map((d) => d.short),
                datasets: [
                  {
                    data: perDept,
                    backgroundColor: [MAROON, DARK, GOLD, "#274E37", "#1F3A5F"],
                    borderWidth: 2,
                    borderColor: "#fff",
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "62%",
                plugins: {
                  legend: {
                    position: "bottom",
                    labels: { boxWidth: 10, font: { size: 11 } },
                  },
                },
              },
            });
            const W = DB.get("weeklyCirc");
            UI.chart("ch-week", {
              type: "line",
              data: {
                labels: W.labels,
                datasets: [
                  {
                    label: "Checkouts",
                    data: W.checkouts,
                    borderColor: MAROON,
                    backgroundColor: "rgba(125,21,25,.08)",
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                  },
                  {
                    label: "Returns",
                    data: W.returns,
                    borderColor: GOLD,
                    backgroundColor: "rgba(250,166,26,.08)",
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "bottom",
                    labels: { boxWidth: 10, font: { size: 11 } },
                  },
                },
                scales: {
                  y: { beginAtZero: true, grid: { color: "#F1ECE3" } },
                  x: { grid: { display: false } },
                },
              },
            });
          });
        };

        /* ---------- Module 14: Reports & Analytics ---------- */
        const REP = {
          circulation: {
            label: "Circulation summary",
            gen: function () {
              const loans = scoped(DB.get("loans"));
              return {
                cards: [
                  { l: "Total loans", v: loans.length, i: "repeat" },
                  {
                    l: "Returned on time",
                    v: loans.filter((l) => l.returned && l.returned <= l.due)
                      .length,
                    i: "check",
                  },
                  {
                    l: "Returned late",
                    v: loans.filter((l) => l.returned && l.returned > l.due)
                      .length,
                    i: "alert-triangle",
                  },
                  {
                    l: "Currently overdue",
                    v: loans.filter((l) => loanStatus(l) === "overdue").length,
                    i: "clock",
                  },
                ],
                columns: [
                  { key: "id", label: "Loan #" },
                  { key: "book", label: "Book" },
                  { key: "patron", label: "Patron" },
                  { key: "dept", label: "Dept" },
                  { key: "checkout", label: "Checkout" },
                  { key: "due", label: "Due" },
                  { key: "status", label: "Status" },
                ],
                rows: loans.map((l) => ({
                  id: l.id,
                  book: trunc(bookTitle(l.bookId), 40),
                  patron: patronName(l.patronId),
                  dept: deptShort(l.dept),
                  checkout: l.checkout,
                  due: l.due,
                  status: loanStatus(l),
                })),
                chart: {
                  type: "bar",
                  data: {
                    labels: DB.get("monthlyLoans").labels,
                    datasets: [
                      {
                        label: "Loans per month",
                        data: DB.get("monthlyLoans").counts,
                        backgroundColor: MAROON,
                        borderRadius: 5,
                      },
                    ],
                  },
                },
              };
            },
          },
          overdues: {
            label: "Overdue report",
            gen: function () {
              const rows = scoped(DB.get("loans"))
                .filter((l) => loanStatus(l) === "overdue")
                .map(function (l) {
                  const days = daysLate(l.due);
                  const S = settings();
                  return {
                    id: l.id,
                    book: trunc(bookTitle(l.bookId), 40),
                    patron: patronName(l.patronId),
                    contact: (patronById(l.patronId) || {}).email || "",
                    dept: deptShort(l.dept),
                    due: l.due,
                    days: days,
                    fine: money(days * S.finePerDay),
                  };
                });
              return {
                cards: [
                  { l: "Overdue items", v: rows.length, i: "alert-triangle" },
                  {
                    l: "Total fines accruing",
                    v: money(
                      rows.reduce(
                        (s, r) => s + r.days * settings().finePerDay,
                        0,
                      ),
                    ),
                    i: "banknote",
                  },
                  {
                    l: "Patrons affected",
                    v: new Set(rows.map((r) => r.patron)).size,
                    i: "users",
                  },
                  {
                    l: "Oldest overdue",
                    v: rows.length
                      ? rows.reduce((a, b) => (a.days > b.days ? a : b)).days +
                        " days"
                      : 0,
                    i: "calendar",
                  },
                ],
                columns: [
                  { key: "id", label: "Loan #" },
                  { key: "book", label: "Book" },
                  { key: "patron", label: "Patron" },
                  {
                    key: "contact",
                    label: "Contact",
                    cls: "hidden md:table-cell",
                  },
                  { key: "due", label: "Due", render: (r) => fmtDate(r.due) },
                  { key: "days", label: "Days late" },
                  { key: "fine", label: "Fine accrued" },
                ],
                rows: rows,
              };
            },
          },
          popular: {
            label: "Most popular books",
            gen: function () {
              const rows = scoped(DB.get("books"))
                .slice()
                .sort((a, b) => b.popularity - a.popularity)
                .slice(0, 15)
                .map((b) => ({
                  title: trunc(b.title, 48),
                  author: b.author,
                  dept: deptShort(b.dept),
                  callNo: b.callNo,
                  loans: b.popularity,
                  available: b.available,
                }));
              return {
                cards: [
                  {
                    l: "Top title",
                    v: trunc(rows[0] ? rows[0].title : "—", 24),
                    i: "trophy",
                  },
                  {
                    l: "Total loans (top 15)",
                    v: rows.reduce((s, r) => s + r.loans, 0),
                    i: "repeat",
                  },
                  {
                    l: "Avg loans/title",
                    v: rows.length
                      ? Math.round(
                          rows.reduce((s, r) => s + r.loans, 0) / rows.length,
                        )
                      : 0,
                    i: "trending-up",
                  },
                  { l: "Titles analyzed", v: rows.length, i: "book-open" },
                ],
                columns: [
                  { key: "title", label: "Title" },
                  {
                    key: "author",
                    label: "Author",
                    cls: "hidden md:table-cell",
                  },
                  { key: "callNo", label: "Call no." },
                  { key: "dept", label: "Dept" },
                  { key: "loans", label: "All-time loans" },
                  { key: "available", label: "Available now" },
                ],
                rows: rows,
                chart: {
                  type: "bar",
                  data: {
                    labels: rows.slice(0, 8).map((r) => trunc(r.title, 22)),
                    datasets: [
                      {
                        label: "Loans",
                        data: rows.slice(0, 8).map((r) => r.loans),
                        backgroundColor: GOLD,
                        borderRadius: 5,
                      },
                    ],
                  },
                  horizontal: true,
                },
              };
            },
          },
          patrons: {
            label: "Patron report",
            gen: function () {
              const rows = scoped(DB.get("patrons")).map(function (p) {
                const loans = DB.get("loans").filter(
                  (l) => l.patronId === p.id,
                );
                return {
                  name: p.name,
                  no: p.no,
                  type: p.type,
                  program: p.program,
                  dept: deptShort(p.dept),
                  loans: loans.length,
                  fines: money(patronOutstanding(p.id)),
                  status: p.status,
                };
              });
              return {
                cards: [
                  { l: "Total patrons", v: rows.length, i: "users" },
                  {
                    l: "Students",
                    v: rows.filter((r) => r.type === "student").length,
                    i: "graduation-cap",
                  },
                  {
                    l: "With active loans",
                    v: rows.filter((r) =>
                      DB.get("loans").some(
                        (l) =>
                          l.patronId ===
                            DB.get("patrons").find((p) => p.no === r.no).id &&
                          loanStatus(l) !== "returned",
                      ),
                    ).length,
                    i: "book-open",
                  },
                  {
                    l: "With fines due",
                    v: rows.filter(
                      (r) => parseFloat(r.fines.replace(/[^\d.]/g, "")) > 0,
                    ).length,
                    i: "banknote",
                  },
                ],
                columns: [
                  { key: "name", label: "Name" },
                  { key: "no", label: "ID no." },
                  { key: "type", label: "Type" },
                  {
                    key: "program",
                    label: "Program",
                    cls: "hidden md:table-cell",
                  },
                  { key: "dept", label: "Dept" },
                  { key: "loans", label: "Lifetime loans" },
                  { key: "fines", label: "Fines due" },
                  { key: "status", label: "Status" },
                ],
                rows: rows,
              };
            },
          },
          inventory: {
            label: "Inventory report",
            gen: function () {
              const books = scoped(DB.get("books"));
              const flags = DB.get("inventoryFlags").filter((f) => {
                const b = bookById(f.bookId);
                return (
                  b && (Session.dept() === "all" || b.dept === Session.dept())
                );
              });
              const rows = books.map((b) => ({
                title: trunc(b.title, 44),
                callNo: b.callNo,
                dept: deptShort(b.dept),
                copies: b.copies,
                available: b.available,
                onLoan: b.copies - b.available,
                issues:
                  flags
                    .filter((f) => f.bookId === b.id && f.status === "open")
                    .map((f) => f.type)
                    .join(", ") || "—",
              }));
              return {
                cards: [
                  {
                    l: "Total copies",
                    v: books.reduce((s, b) => s + b.copies, 0),
                    i: "library",
                  },
                  {
                    l: "On loan",
                    v: books.reduce((s, b) => s + (b.copies - b.available), 0),
                    i: "repeat",
                  },
                  {
                    l: "Open issues",
                    v: flags.filter((f) => f.status === "open").length,
                    i: "alert-circle",
                  },
                  {
                    l: "Last stocktake accuracy",
                    v: (DB.get("stocktakes")[0] || {}).accuracy + "%",
                    i: "clipboard-check",
                  },
                ],
                columns: [
                  { key: "title", label: "Title" },
                  { key: "callNo", label: "Call no." },
                  { key: "dept", label: "Dept" },
                  { key: "copies", label: "Copies" },
                  { key: "available", label: "Available" },
                  { key: "onLoan", label: "On loan" },
                  { key: "issues", label: "Open issues" },
                ],
                rows: rows,
              };
            },
          },
          acquisitions: {
            label: "Acquisition report",
            gen: function () {
              const reqs = DB.get("requests").filter(
                (r) => Session.dept() === "all" || r.dept === Session.dept(),
              );
              const rows = reqs.map((r) => ({
                id: r.id,
                title: trunc(r.title, 44),
                dept: deptShort(r.dept),
                qty: r.qty,
                cost: money(r.estCost),
                date: r.date,
                status: r.status,
              }));
              const total = reqs.reduce((s, r) => s + r.estCost, 0);
              return {
                cards: [
                  { l: "Requests", v: reqs.length, i: "cart" },
                  {
                    l: "Total value requested",
                    v: money(total),
                    i: "banknote",
                  },
                  {
                    l: "Approved / ordered",
                    v: reqs.filter((r) =>
                      ["approved", "ordered", "received"].includes(r.status),
                    ).length,
                    i: "check",
                  },
                  {
                    l: "Pending",
                    v: reqs.filter((r) => r.status === "pending").length,
                    i: "clock",
                  },
                ],
                columns: [
                  { key: "id", label: "Req #" },
                  { key: "title", label: "Title" },
                  { key: "dept", label: "Dept" },
                  { key: "qty", label: "Qty" },
                  { key: "cost", label: "Est. cost" },
                  { key: "date", label: "Date" },
                  { key: "status", label: "Status" },
                ],
                rows: rows,
              };
            },
          },
          departments: {
            label: "Department comparison",
            gen: function () {
              const rows = DEPARTMENTS.map(function (d) {
                const bk = DB.get("books").filter((b) => b.dept === d.id);
                const ln = DB.get("loans").filter((l) => l.dept === d.id);
                return {
                  dept: d.name,
                  titles: bk.length,
                  copies: bk.reduce((s, b) => s + b.copies, 0),
                  patrons: DB.get("patrons").filter((p) => p.dept === d.id)
                    .length,
                  loans: ln.length,
                  overdue: ln.filter((l) => loanStatus(l) === "overdue").length,
                  budget: money(
                    (DB.get("budget").find((x) => x.dept === d.id) || {})
                      .allocated || 0,
                  ),
                };
              });
              return {
                cards: [
                  { l: "Departments", v: 5, i: "building-2" },
                  {
                    l: "Combined titles",
                    v: rows.reduce((s, r) => s + r.titles, 0),
                    i: "library",
                  },
                  {
                    l: "Combined patrons",
                    v: rows.reduce((s, r) => s + r.patrons, 0),
                    i: "users",
                  },
                  {
                    l: "Combined loans",
                    v: rows.reduce((s, r) => s + r.loans, 0),
                    i: "repeat",
                  },
                ],
                columns: [
                  { key: "dept", label: "Department" },
                  { key: "titles", label: "Titles" },
                  { key: "copies", label: "Copies" },
                  { key: "patrons", label: "Patrons" },
                  { key: "loans", label: "Loans" },
                  { key: "overdue", label: "Overdue" },
                  { key: "budget", label: "FY budget" },
                ],
                rows: rows,
                chart: {
                  type: "bar",
                  data: {
                    labels: rows.map((r) =>
                      deptShort(
                        r.dept.toLowerCase().includes("college")
                          ? "college"
                          : r.dept,
                      ),
                    ),
                    datasets: [
                      {
                        label: "Loans",
                        data: rows.map((r) => r.loans),
                        backgroundColor: MAROON,
                        borderRadius: 5,
                      },
                      {
                        label: "Overdue",
                        data: rows.map((r) => r.overdue),
                        backgroundColor: GOLD,
                        borderRadius: 5,
                      },
                    ],
                  },
                },
              };
            },
          },
          annual: {
            label: "Annual statistics 2026",
            gen: function () {
              const M = DB.get("monthlyLoans");
              const rows = M.labels.map((m, i) => ({
                month: m,
                loans: M.counts[i],
                visitors: DB.get("visitors").monthly.counts[i] || 0,
              }));
              return {
                cards: [
                  {
                    l: "Loans YTD",
                    v: M.counts.reduce((a, b) => a + b, 0).toLocaleString(),
                    i: "repeat",
                  },
                  {
                    l: "Visitors YTD",
                    v: DB.get("visitors")
                      .monthly.counts.reduce((a, b) => a + b, 0)
                      .toLocaleString(),
                    i: "users",
                  },
                  {
                    l: "Best month",
                    v: M.labels[
                      M.counts.indexOf(Math.max.apply(null, M.counts))
                    ],
                    i: "trophy",
                  },
                  {
                    l: "Avg loans/month",
                    v: Math.round(M.counts.reduce((a, b) => a + b, 0) / 12),
                    i: "trending-up",
                  },
                ],
                columns: [
                  { key: "month", label: "Month" },
                  { key: "loans", label: "Loans" },
                  { key: "visitors", label: "Visitors" },
                ],
                rows: rows,
                chart: {
                  type: "line",
                  data: {
                    labels: M.labels,
                    datasets: [
                      {
                        label: "Loans",
                        data: M.counts,
                        borderColor: MAROON,
                        tension: 0.35,
                        fill: false,
                      },
                      {
                        label: "Visitors (÷100)",
                        data: rows.map((r) => Math.round(r.visitors / 100)),
                        borderColor: GOLD,
                        tension: 0.35,
                        fill: false,
                      },
                    ],
                  },
                },
              };
            },
          },
        };
        Modules.reports = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Reports & Analytics",
              desc: "Generate circulation, patron, inventory and acquisition reports with date and department filters. CSV export is functional; PDF/Excel exports are simulated.",
            }) +
            '<div class="card p-4 mb-5"><div class="grid md:grid-cols-4 gap-3 items-end">' +
            '<div><label class="label">Report type</label><select id="rp-type" class="input w-full">' +
            Object.keys(REP)
              .map(
                (k) =>
                  '<option value="' + k + '">' + REP[k].label + "</option>",
              )
              .join("") +
            "</select></div>" +
            '<div><label class="label">Date from</label><input id="rp-from" type="date" class="input w-full" value="2026-01-01"></div>' +
            '<div><label class="label">Date to</label><input id="rp-to" type="date" class="input w-full" value="' +
            todayStr() +
            '"></div>' +
            '<button id="rp-run" class="btn btn-primary justify-center"><i data-lucide="play" class="w-4 h-4"></i> Generate report</button>' +
            '</div><div class="text-[11px] text-muted mt-2">Department scope: <strong>' +
            esc(
              Session.dept() === "all"
                ? "All departments"
                : deptName(Session.dept()),
            ) +
            "</strong> — change it from the top bar.</div></div>" +
            '<div id="rp-out"></div>';
          lucide.createIcons();
          let last = null;
          function run() {
            const type = document.getElementById("rp-type").value;
            const out = document.getElementById("rp-out");
            out.innerHTML =
              '<div class="space-y-4"><div class="skeleton h-24"></div><div class="skeleton h-56"></div></div>';
            setTimeout(function () {
              const rep = REP[type].gen();
              last = { type: type, rep: rep };
              out.innerHTML =
                '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">' +
                rep.cards
                  .map((c) =>
                    UI.statCard({
                      label: c.l,
                      value: c.v,
                      icon: c.i,
                      tone: "maroon",
                    }),
                  )
                  .join("") +
                "</div>" +
                (rep.chart
                  ? '<div class="card p-4 mb-5"><div class="flex justify-between items-center mb-3"><h3 class="font-serif font-bold">' +
                    REP[type].label +
                    '</h3><span class="sim-tag">Simulated data</span></div><div class="h-64"><canvas id="rp-chart"></canvas></div></div>'
                  : "") +
                '<div class="card"><div class="table-toolbar"><div class="font-serif font-bold">' +
                REP[type].label +
                ' — detail rows</div><div class="ml-auto flex gap-2 flex-wrap">' +
                '<button class="btn btn-outline btn-sm" data-ex="csv"><i data-lucide="file-spreadsheet" class="w-3.5 h-3.5"></i> Export CSV</button>' +
                '<button class="btn btn-outline btn-sm" data-ex="excel"><i data-lucide="sheet" class="w-3.5 h-3.5"></i> Excel (sim.)</button>' +
                '<button class="btn btn-outline btn-sm" data-ex="pdf"><i data-lucide="file-text" class="w-3.5 h-3.5"></i> PDF (sim.)</button>' +
                '<button class="btn btn-outline btn-sm" data-ex="print"><i data-lucide="printer" class="w-3.5 h-3.5"></i> Print</button></div></div><div id="rp-tbl"></div></div>';
              lucide.createIcons();
              if (rep.chart) {
                const c = rep.chart;
                UI.chart("rp-chart", {
                  type: c.type,
                  data: c.data,
                  options: {
                    indexAxis: c.horizontal ? "y" : "x",
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: "bottom",
                        labels: { boxWidth: 10, font: { size: 11 } },
                      },
                    },
                    scales: c.horizontal
                      ? {
                          x: { beginAtZero: true, grid: { color: "#F1ECE3" } },
                          y: { grid: { display: false } },
                        }
                      : {
                          y: { beginAtZero: true, grid: { color: "#F1ECE3" } },
                          x: { grid: { display: false } },
                        },
                  },
                });
              }
              UI.renderTable("#rp-tbl", {
                columns: rep.columns,
                rows: rep.rows,
                deptScope: false,
                searchKeys: rep.columns.map((c) => c.key),
                searchPlaceholder: "Filter report rows…",
                pageSize: 12,
              });
              out.querySelectorAll("[data-ex]").forEach(function (b) {
                b.onclick = function () {
                  const mode = b.dataset.ex;
                  if (mode === "csv") UI.exportCSV("report_" + type, rep.rows);
                  else if (mode === "print") window.print();
                  else
                    UI.toast(
                      mode.toUpperCase() +
                        " export simulated — in production the server renders a formatted " +
                        mode.toUpperCase() +
                        " file.",
                      "info",
                    );
                };
              });
            }, 350);
          }
          document.getElementById("rp-run").onclick = run;
          document.getElementById("rp-type").onchange = run;
          run();
        };

        /* ---------- Module 19: Visitor Statistics ---------- */
        Modules.visitors = function (el) {
          const V = DB.get("visitors");
          el.innerHTML =
            UI.pageHead({
              title: "Visitor Statistics",
              desc: "Anonymous gate-count and reading-room usage statistics. No personal information is captured — sample data only.",
              actions: [
                {
                  label: "Export CSV",
                  icon: "download",
                  cls: "btn-outline",
                  onclick:
                    "UI.exportCSV('visitor_daily',DB.get('visitors').daily,['date','count'])",
                },
              ],
            }) +
            '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">' +
            UI.statCard({
              label: "Visitors today",
              value: V.today,
              icon: "door-open",
              tone: "maroon",
              sub: "as of gate count 6:00 PM",
            }) +
            UI.statCard({
              label: "30-day total",
              value: V.daily.reduce((s, d) => s + d.count, 0).toLocaleString(),
              icon: "calendar-range",
              tone: "gold",
            }) +
            UI.statCard({
              label: "Daily average",
              value: Math.round(V.daily.reduce((s, d) => s + d.count, 0) / 30),
              icon: "trending-up",
              tone: "blue",
            }) +
            UI.statCard({
              label: "Peak hour",
              value:
                V.peak.labels[
                  V.peak.counts.indexOf(Math.max.apply(null, V.peak.counts))
                ],
              icon: "clock",
              tone: "green",
              sub: "busiest hour of the day",
            }) +
            "</div>" +
            '<div class="grid lg:grid-cols-2 gap-5 mb-5">' +
            '<div class="card p-4"><div class="flex justify-between mb-3"><h3 class="font-serif font-bold">Daily visitors (last 30 days)</h3><span class="sim-tag">Simulated</span></div><div class="h-60"><canvas id="v-daily"></canvas></div></div>' +
            '<div class="card p-4"><div class="flex justify-between mb-3"><h3 class="font-serif font-bold">Monthly visitors (12 months)</h3><span class="sim-tag">Simulated</span></div><div class="h-60"><canvas id="v-month"></canvas></div></div>' +
            "</div>" +
            '<div class="grid lg:grid-cols-2 gap-5">' +
            '<div class="card p-4"><h3 class="font-serif font-bold mb-3">Peak hours (weekday profile)</h3><div class="h-56"><canvas id="v-peak"></canvas></div></div>' +
            '<div class="card p-4"><h3 class="font-serif font-bold mb-3">Visitors by department</h3><div class="grid md:grid-cols-2 gap-4 items-center"><div class="h-48"><canvas id="v-dept"></canvas></div><div class="space-y-2">' +
            V.byDept
              .map(function (d) {
                return (
                  '<div class="flex items-center justify-between text-sm border-b border-ink/5 pb-1.5"><span>' +
                  UI.deptBadge(d.dept) +
                  ' <span class="ml-1">' +
                  esc(deptName(d.dept)) +
                  '</span></span><span class="font-semibold">' +
                  d.share +
                  "%</span></div>"
                );
              })
              .join("") +
            '<p class="text-[11px] text-muted pt-1">Counts are anonymized aggregates from simulated door sensors.</p></div></div></div>' +
            "</div>";
          lucide.createIcons();
          UI.chart("v-daily", {
            type: "line",
            data: {
              labels: V.daily.map((d) => d.date.slice(5)),
              datasets: [
                {
                  label: "Visitors",
                  data: V.daily.map((d) => d.count),
                  borderColor: MAROON,
                  backgroundColor: "rgba(125,21,25,.08)",
                  fill: true,
                  tension: 0.3,
                  pointRadius: 2,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: "#F1ECE3" } },
                x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
              },
            },
          });
          UI.chart("v-month", {
            type: "bar",
            data: {
              labels: V.monthly.labels,
              datasets: [
                {
                  label: "Visitors",
                  data: V.monthly.counts,
                  backgroundColor: GOLD,
                  borderRadius: 5,
                  maxBarThickness: 26,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: "#F1ECE3" } },
                x: { grid: { display: false } },
              },
            },
          });
          UI.chart("v-peak", {
            type: "bar",
            data: {
              labels: V.peak.labels,
              datasets: [
                {
                  label: "Avg visitors",
                  data: V.peak.counts,
                  backgroundColor: V.peak.counts.map((c) =>
                    c === Math.max.apply(null, V.peak.counts)
                      ? MAROON
                      : "#D9C9A3",
                  ),
                  borderRadius: 4,
                  maxBarThickness: 22,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: "#F1ECE3" } },
                x: { grid: { display: false } },
              },
            },
          });
          UI.chart("v-dept", {
            type: "doughnut",
            data: {
              labels: V.byDept.map((d) => deptShort(d.dept)),
              datasets: [
                {
                  data: V.byDept.map((d) => d.share),
                  backgroundColor: [MAROON, GOLD, "#274E37", DARK, "#1F3A5F"],
                  borderWidth: 2,
                  borderColor: "#fff",
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: "60%",
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { boxWidth: 10, font: { size: 11 } },
                },
              },
            },
          });
        };

        /* ---------- Module 22: System Monitoring ---------- */
        Modules.monitoring = function (el) {
          const M = DB.get("monitoring");
          el.innerHTML =
            UI.pageHead({
              title: "System Monitoring & Operational Health",
              desc: "Grafana/Prometheus-style health concept for the future production system.",
              actions: [
                {
                  label: "Refresh health check",
                  icon: "refresh-cw",
                  cls: "btn-outline",
                  onclick: "App.rerender()",
                },
              ],
            }) +
            '<div class="card p-3.5 mb-5 flex items-start gap-3 !bg-amber-50 !border-amber-200"><i data-lucide="flask-conical" class="w-5 h-5 text-amber-700 mt-0.5"></i><div class="text-xs text-amber-900"><strong>Everything on this page is simulated prototype data.</strong> Metrics, logs, uptime and service states are generated in the browser for demonstration. No real servers, databases or Koha connections are monitored.</div></div>' +
            '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">' +
            UI.statCard({
              label: "Application status",
              value: "Operational",
              icon: "server",
              tone: "green",
              sub: "frontend prototype responding",
            }) +
            UI.statCard({
              label: "Database (simulated)",
              value: "Healthy",
              icon: "database",
              tone: "green",
              sub: "localStorage · 12 ms avg",
            }) +
            UI.statCard({
              label: "Koha integration",
              value: "Not connected",
              icon: "unplug",
              tone: "gray",
              sub: "planned — integration-dependent",
            }) +
            UI.statCard({
              label: "Uptime (30d, sim.)",
              value: "99.2%",
              icon: "activity",
              tone: "blue",
              sub: "2 maintenance windows",
            }) +
            "</div>" +
            '<div class="grid lg:grid-cols-3 gap-5 mb-5">' +
            '<div class="card p-4 lg:col-span-2"><div class="flex justify-between items-center mb-3"><h3 class="font-serif font-bold">Resource usage (live simulated)</h3><span class="sim-tag">Updates every 3s</span></div><div class="h-60"><canvas id="m-res"></canvas></div></div>' +
            '<div class="card p-4"><h3 class="font-serif font-bold mb-3">Service health</h3><div class="space-y-2.5">' +
            M.services
              .map(function (s) {
                const col =
                  s.status === "operational"
                    ? "#157F3D"
                    : s.status === "degraded"
                      ? "#C77F0A"
                      : "#6B625F";
                return (
                  '<div class="flex items-center gap-2.5 text-sm"><span class="health-dot" style="background:' +
                  col +
                  '"></span><span class="flex-1 font-medium">' +
                  esc(s.name) +
                  '</span><span class="text-xs text-muted">' +
                  esc(s.latency) +
                  "</span>" +
                  UI.badge(
                    s.status.replace("-", " "),
                    s.status === "operational"
                      ? "green"
                      : s.status === "degraded"
                        ? "amber"
                        : "gray",
                  ) +
                  "</div>"
                );
              })
              .join("") +
            "</div></div>" +
            "</div>" +
            '<div class="grid lg:grid-cols-3 gap-5">' +
            '<div class="card p-4"><h3 class="font-serif font-bold mb-3">Background tasks</h3><div class="space-y-2.5">' +
            M.tasks
              .map(function (t) {
                return (
                  '<div class="border border-ink/8 rounded-lg p-2.5"><div class="flex justify-between items-center"><span class="font-semibold text-sm">' +
                  esc(t.name) +
                  "</span>" +
                  UI.statusBadge(t.status) +
                  '</div><div class="text-[11px] text-muted mt-1">' +
                  esc(t.schedule) +
                  " · last: " +
                  esc(String(t.lastRun)) +
                  "</div></div>"
                );
              })
              .join("") +
            "</div></div>" +
            '<div class="card p-4"><h3 class="font-serif font-bold mb-3">Recent system events</h3><div class="space-y-2.5 text-sm">' +
            M.events
              .map(function (e) {
                return (
                  '<div class="flex gap-2.5"><span class="text-[11px] font-mono text-muted whitespace-nowrap pt-0.5">' +
                  esc(e.ts.slice(5)) +
                  '</span><span class="text-[12.5px] leading-snug">' +
                  esc(e.text) +
                  "</span></div>"
                );
              })
              .join("") +
            "</div></div>" +
            '<div class="card p-4"><h3 class="font-serif font-bold mb-3">Error log (simulated)</h3><div class="space-y-2">' +
            M.errors
              .map(function (e) {
                const tone =
                  e.level === "error"
                    ? "red"
                    : e.level === "warn"
                      ? "amber"
                      : "blue";
                return (
                  '<div class="border-l-2 pl-2.5 py-1" style="border-color:' +
                  (e.level === "error"
                    ? "#B42318"
                    : e.level === "warn"
                      ? GOLD
                      : "#1D4E89") +
                  '"><div class="flex justify-between"><span class="badge badge-' +
                  tone +
                  '">' +
                  e.level +
                  '</span><span class="text-[10px] text-muted font-mono">' +
                  esc(e.ts) +
                  '</span></div><div class="text-[12px] mt-1">' +
                  esc(e.message) +
                  ' <span class="text-muted">[' +
                  esc(e.source) +
                  "]</span></div></div>"
                );
              })
              .join("") +
            "</div></div>" +
            "</div>";
          lucide.createIcons();
          const labels = [];
          const cpu = [];
          const mem = [];
          const now = new Date();
          for (let i = 19; i >= 0; i--) {
            const t = new Date(now - i * 3000);
            labels.push(
              t.toLocaleTimeString("en-PH", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
            );
            cpu.push(18 + Math.round(Math.random() * 22));
            mem.push(46 + Math.round(Math.random() * 12));
          }
          const ch = UI.chart("m-res", {
            type: "line",
            data: {
              labels: labels,
              datasets: [
                {
                  label: "CPU %",
                  data: cpu,
                  borderColor: MAROON,
                  tension: 0.4,
                  pointRadius: 0,
                },
                {
                  label: "Memory %",
                  data: mem,
                  borderColor: GOLD,
                  tension: 0.4,
                  pointRadius: 0,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 0 },
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { boxWidth: 10, font: { size: 11 } },
                },
              },
              scales: {
                y: { min: 0, max: 100, grid: { color: "#F1ECE3" } },
                x: {
                  grid: { display: false },
                  ticks: { maxTicksLimit: 6, font: { size: 9 } },
                },
              },
            },
          });
          UI.timer(function () {
            if (!document.getElementById("m-res")) return;
            labels.push(
              new Date().toLocaleTimeString("en-PH", { hour12: false }),
            );
            cpu.push(18 + Math.round(Math.random() * 22));
            mem.push(46 + Math.round(Math.random() * 12));
            if (labels.length > 20) {
              labels.shift();
              cpu.shift();
              mem.shift();
            }
            if (ch) ch.update();
          });
        };

        /* ---------- Module 13: Notifications & Communication ---------- */
        Modules.notifications = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Notifications & Communication",
              desc: "Announcements, overdue reminders, reservation notices and notification templates. Email delivery is simulated.",
              actions: [
                {
                  label: "Compose announcement",
                  icon: "megaphone",
                  cls: "btn-primary",
                  minLevel: 2,
                  onclick: "noteCompose()",
                },
                {
                  label: "Browser notice (sim.)",
                  icon: "bell-ring",
                  cls: "btn-outline",
                  onclick: "noteBrowser()",
                },
              ],
            }) +
            '<div class="tabs mb-5" id="nt-tabs"><button class="tab-btn active" data-t="inbox">Inbox</button><button class="tab-btn" data-t="templates">Templates</button><button class="tab-btn" data-t="history">Send history</button></div><div id="nt-body"></div>';
          lucide.createIcons();
          function inbox() {
            document.getElementById("nt-body").innerHTML =
              '<div class="grid lg:grid-cols-3 gap-5">' +
              '<div class="card lg:col-span-1 overflow-hidden"><div class="table-toolbar !py-2.5"><select id="nt-filter" class="input !py-1.5 !text-xs"><option value="">All notifications</option><option value="unread">Unread only</option><option value="overdue">Overdue notices</option><option value="reservation">Reservation</option><option value="announcement">Announcements</option><option value="system">System</option></select><button id="nt-all" class="btn btn-ghost btn-sm ml-auto"><i data-lucide="check-check" class="w-3.5 h-3.5"></i> Mark all read</button></div><div id="nt-list" class="max-h-[520px] overflow-y-auto"></div></div>' +
              '<div class="card lg:col-span-2 p-5" id="nt-detail"><div class="empty"><i data-lucide="mail-open"></i><p class="text-sm">Select a notification to read it</p></div></div></div>';
            lucide.createIcons();
            let sel = null;
            function list() {
              const f = document.getElementById("nt-filter").value;
              let notes = DB.get("notifications");
              if (f === "unread") notes = notes.filter((n) => !n.read);
              else if (f) notes = notes.filter((n) => n.type === f);
              const box = document.getElementById("nt-list");
              if (!notes.length) {
                box.innerHTML = UI.empty("Nothing here", "bell-off");
                lucide.createIcons();
                return;
              }
              box.innerHTML = notes
                .map(function (n) {
                  const ic =
                    {
                      overdue: "alert-triangle",
                      reservation: "bookmark",
                      due: "clock",
                      announcement: "megaphone",
                      system: "settings-2",
                    }[n.type] || "bell";
                  return (
                    '<button class="w-full text-left px-4 py-3 border-b border-ink/5 hover:bg-warm flex gap-3 ' +
                    (sel === n.id
                      ? "bg-warm border-l-2 !border-l-maroon"
                      : "") +
                    " " +
                    (n.read ? "" : "") +
                    '" data-n="' +
                    n.id +
                    '">' +
                    '<span class="stat-ic !w-8 !h-8 !rounded-lg flex-shrink-0" style="background:' +
                    (n.read ? "#EFEDE9" : "#F6E7E7") +
                    ";color:" +
                    (n.read ? "#6B625F" : "#7D1519") +
                    '"><i data-lucide="' +
                    ic +
                    '" class="w-4 h-4"></i></span>' +
                    '<span class="min-w-0 flex-1"><span class="flex justify-between gap-2"><span class="text-[13px] font-semibold truncate ' +
                    (n.read ? "text-muted" : "") +
                    '">' +
                    esc(n.title) +
                    "</span>" +
                    (n.read
                      ? ""
                      : '<span class="w-2 h-2 rounded-full bg-gold flex-shrink-0 mt-1.5"></span>') +
                    "</span>" +
                    '<span class="block text-[11px] text-muted truncate">' +
                    esc(trunc(n.body, 52)) +
                    " · " +
                    fmtDate(n.date) +
                    "</span></span></button>"
                  );
                })
                .join("");
              lucide.createIcons();
              box.querySelectorAll("[data-n]").forEach(function (b) {
                b.onclick = function () {
                  sel = this.dataset.n;
                  const notes = DB.get("notifications");
                  const n = notes.find((x) => x.id === sel);
                  n.read = true;
                  DB.set("notifications", notes);
                  list();
                  detail(n);
                  App.updateBellCount();
                  App.renderSidebar();
                };
              });
            }
            function detail(n) {
              const d = document.getElementById("nt-detail");
              d.innerHTML =
                '<div class="flex items-start justify-between gap-3"><div><h3 class="font-serif text-xl font-bold">' +
                esc(n.title) +
                '</h3><div class="text-xs text-muted mt-1">' +
                esc(n.type.toUpperCase()) +
                " · " +
                fmtDate(n.date) +
                " · audience: " +
                esc(
                  n.audience === "all"
                    ? "Everyone"
                    : n.audience === "staff"
                      ? "Library staff"
                      : deptName(n.audience),
                ) +
                " · priority " +
                esc(n.priority) +
                "</div></div>" +
                UI.badge(n.read ? "Read" : "Unread", n.read ? "gray" : "gold") +
                "</div>" +
                '<p class="text-sm mt-5 leading-relaxed whitespace-pre-line">' +
                esc(n.body) +
                "</p>" +
                '<div class="mt-6 p-3 bg-warm rounded-lg text-xs text-muted flex items-start gap-2"><i data-lucide="mail" class="w-4 h-4 flex-shrink-0 mt-0.5"></i> Email/SMS delivery for this notice is simulated — nothing was actually sent from this prototype.</div>' +
                '<div class="flex gap-2 mt-5"><button class="btn btn-outline btn-sm" data-resend><i data-lucide="send" class="w-3.5 h-3.5"></i> Resend (simulated)</button><button class="btn btn-ghost btn-sm" data-unread><i data-lucide="mail" class="w-3.5 h-3.5"></i> Mark unread</button></div>';
              lucide.createIcons();
              d.querySelector("[data-resend]").onclick = function () {
                UI.toast(
                  "Notification re-queued for delivery (simulated)",
                  "info",
                );
                logActivity(
                  "Notification re-sent (simulated): " + n.title,
                  "notification",
                );
              };
              d.querySelector("[data-unread]").onclick = function () {
                const a = DB.get("notifications");
                a.find((x) => x.id === n.id).read = false;
                DB.set("notifications", a);
                App.updateBellCount();
                App.renderSidebar();
                list();
                document.getElementById("nt-detail").innerHTML =
                  '<div class="empty"><i data-lucide="mail-open"></i><p class="text-sm">Select a notification to read it</p></div>';
                lucide.createIcons();
                UI.toast("Marked as unread", "info");
              };
            }
            document.getElementById("nt-filter").onchange = list;
            document.getElementById("nt-all").onclick = function () {
              const a = DB.get("notifications");
              a.forEach((n) => (n.read = true));
              DB.set("notifications", a);
              list();
              App.updateBellCount();
              App.renderSidebar();
              UI.toast("All notifications marked as read", "success");
            };
            list();
          }
          function templates() {
            document.getElementById("nt-body").innerHTML =
              '<div class="card" id="nt-tpl"></div>';
            UI.renderTable("#nt-tpl", {
              columns: [
                { key: "name", label: "Template" },
                {
                  key: "subject",
                  label: "Subject line",
                  render: (t) =>
                    '<span class="text-xs">' + esc(t.subject) + "</span>",
                },
                {
                  key: "id",
                  label: "Code",
                  render: (t) => '<span class="chip-code">' + t.id + "</span>",
                },
              ],
              rows: () => DB.get("templates"),
              deptScope: false,
              search: false,
              pageSize: 10,
              actions: [
                {
                  icon: "eye",
                  label: "Preview / edit",
                  onClick: (t) =>
                    UI.formModal({
                      title: "Template: " + t.name,
                      subtitle:
                        "Placeholders: {patron_name}, {book_title}, {due_date}, {department}, {fine_amount}, {hold_days}, {count}",
                      icon: "file-pen",
                      size: "lg",
                      values: t,
                      fields: [
                        {
                          name: "name",
                          label: "Template name",
                          required: true,
                          span: 2,
                        },
                        {
                          name: "subject",
                          label: "Subject",
                          required: true,
                          span: 2,
                        },
                        {
                          name: "body",
                          label: "Message body",
                          type: "textarea",
                          rows: 8,
                          span: 2,
                          required: true,
                        },
                      ],
                      onSubmit: function (v, close) {
                        DB.update("templates", t.id, v);
                        DB.audit(
                          "Update",
                          "Notifications",
                          "Template " + t.id + " edited",
                        );
                        close();
                        UI.toast("Template saved", "success");
                        App.rerender();
                      },
                    }),
                },
              ],
            });
          }
          function history() {
            document.getElementById("nt-body").innerHTML =
              '<div class="card" id="nt-hist"></div>';
            UI.renderTable("#nt-hist", {
              columns: [
                { key: "ts", label: "Timestamp" },
                { key: "text", label: "Event" },
                { key: "user", label: "Actor" },
                {
                  key: "type",
                  label: "Type",
                  render: (a) => UI.badge(a.type, "gold"),
                },
              ],
              rows: () =>
                DB.get("activity").filter((a) =>
                  ["notification", "reservation"].includes(a.type),
                ),
              deptScope: false,
              search: false,
              pageSize: 10,
            });
          }
          const tabs = { inbox: inbox, templates: templates, history: history };
          inbox();
          document.querySelectorAll("#nt-tabs .tab-btn").forEach(function (b) {
            b.onclick = function () {
              document
                .querySelectorAll("#nt-tabs .tab-btn")
                .forEach((x) => x.classList.remove("active"));
              b.classList.add("active");
              tabs[b.dataset.t]();
            };
          });
        };
        window.noteCompose = function () {
          UI.formModal({
            title: "Compose announcement",
            subtitle:
              "Delivered to the in-app notification center (email simulated)",
            icon: "megaphone",
            submitText: "Publish announcement",
            size: "md",
            values: { audience: "all", priority: "medium" },
            fields: [
              { name: "title", label: "Title", required: true, span: 2 },
              {
                name: "audience",
                label: "Audience",
                type: "select",
                required: true,
                options: [
                  { v: "all", l: "Everyone" },
                  { v: "staff", l: "Library staff only" },
                ].concat(deptOpts()),
              },
              {
                name: "priority",
                label: "Priority",
                type: "select",
                options: [
                  { v: "low", l: "Low" },
                  { v: "medium", l: "Medium" },
                  { v: "high", l: "High" },
                ],
              },
              {
                name: "body",
                label: "Message",
                type: "textarea",
                rows: 5,
                required: true,
                span: 2,
              },
            ],
            onSubmit: function (v, close) {
              DB.add("notifications", {
                id: uid("N"),
                type: "announcement",
                title: v.title,
                body: v.body,
                date: todayStr(),
                audience: v.audience,
                read: false,
                priority: v.priority,
              });
              DB.add("announcements", {
                id: uid("AN"),
                title: v.title,
                date: todayStr(),
                audience: v.audience,
                body: v.body,
              });
              DB.audit(
                "Announce",
                "Notifications",
                "“" + v.title + "” → " + v.audience,
              );
              logActivity(
                "Announcement published: " + trunc(v.title, 44),
                "notification",
              );
              close();
              UI.toast(
                "Announcement published to notification center",
                "success",
              );
              App.renderSidebar();
              App.updateBellCount();
              App.rerender();
            },
          });
        };
        window.noteBrowser = function () {
          if (!("Notification" in window)) {
            UI.toast(
              "This browser does not support notifications — showing simulated toast instead",
              "warning",
            );
            return;
          }
          if (Notification.permission === "granted") {
            new Notification("USANT Library (simulated)", {
              body: "Prototype browser notification — no real alerts are sent.",
            });
            UI.toast(
              "Browser notification triggered (simulated content)",
              "info",
            );
          } else
            Notification.requestPermission().then(function (p) {
              if (p === "granted") {
                new Notification("USANT Library (simulated)", {
                  body: "Prototype browser notification enabled.",
                });
                UI.toast(
                  "Browser notifications enabled for this demo",
                  "success",
                );
              } else
                UI.toast(
                  "Permission denied — using in-app toasts instead",
                  "warning",
                );
            });
        };

        /* ---------- Module 16: Library Information & Services ---------- */
        Modules.services = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Library Information & Services",
              desc: "Operating hours, rules, borrowing policies, services, announcements, contact details and FAQs. Content is editable and stored locally.",
              actions: [
                {
                  label: "Add announcement",
                  icon: "megaphone",
                  cls: "btn-primary",
                  minLevel: 2,
                  onclick: "noteCompose()",
                },
              ],
            }) +
            '<div class="grid lg:grid-cols-3 gap-5">' +
            '<div class="lg:col-span-2 space-y-5">' +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-3 flex items-center gap-2"><i data-lucide="clock" class="w-4 h-4 text-maroon"></i> Operating hours</h3><div class="overflow-x-auto"><table class="tbl w-full"><thead><tr><th>Department</th><th>Mon–Fri</th><th>Saturday</th><th>Sunday</th>' +
            (Session.atLeast(3) ? "<th></th>" : "") +
            '</tr></thead><tbody id="hrs-body"></tbody></table></div></div>' +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-3 flex items-center gap-2"><i data-lucide="library" class="w-4 h-4 text-maroon"></i> Available services</h3><div class="grid sm:grid-cols-2 gap-3">' +
            [
              [
                "book-open",
                "Reading & research areas",
                "Comfortable silent and group reading spaces in all five libraries.",
              ],
              [
                "repeat",
                "Borrowing & renewal",
                "Students: 3 books / 7 days · Faculty: 5 books / 14 days · Renew up to 2× online.",
              ],
              [
                "bookmark",
                "Reservations & holds",
                "Reserve on-loan titles via the catalog; 3-day pickup window.",
              ],
              [
                "monitor",
                "e-Library computers",
                "10 workstations with access to databases and MS Office (simulated).",
              ],
              [
                "projector",
                "Equipment loans",
                "LCD projectors and laptops for faculty with approved requests.",
              ],
              [
                "presentation",
                "Library orientation",
                "Scheduled orientations for freshmen and new graduate students.",
              ],
              [
                "search",
                "Research assistance",
                "Librarian consultations and literature search support.",
              ],
              [
                "printer",
                "Printing & scanning",
                "Self-service printing at the College Library counter.",
              ],
            ]
              .map(
                (s) =>
                  '<div class="border border-ink/8 rounded-lg p-3.5 flex gap-3"><span class="stat-ic !w-9 !h-9 !rounded-lg flex-shrink-0" style="background:#FFF1D6;color:#8A5A00"><i data-lucide="' +
                  s[0] +
                  '" class="w-4 h-4"></i></span><div><div class="font-semibold text-sm">' +
                  s[1] +
                  '</div><div class="text-xs text-muted mt-0.5">' +
                  s[2] +
                  "</div></div></div>",
              )
              .join("") +
            "</div></div>" +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-3 flex items-center gap-2"><i data-lucide="scroll-text" class="w-4 h-4 text-maroon"></i> Library rules & borrowing policy</h3>' +
            '<div class="grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm text-ink/85">' +
            [
              "Present your USANT ID when borrowing.",
              "Return books on or before the due date.",
              "Overdue fine: ₱2.00 per book per day (simulated).",
              "Lost books: replacement cost + ₱50 processing fee.",
              "No food inside reading areas; covered drinks only.",
              "Bags and personal books are subject to inspection at the counter.",
              "Silence is required in designated study zones.",
              "Report damaged materials immediately to the desk.",
              "Reservations are held for 3 days after the “ready” notice.",
              "Faculty and graduate students may request extended loan periods.",
            ]
              .map(
                (r) =>
                  '<div class="flex gap-2"><i data-lucide="check" class="w-4 h-4 text-green-700 flex-shrink-0 mt-0.5"></i><span>' +
                  r +
                  "</span></div>",
              )
              .join("") +
            "</div></div>" +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-3 flex items-center gap-2"><i data-lucide="megaphone" class="w-4 h-4 text-maroon"></i> Library announcements</h3><div class="space-y-3" id="ann-list"></div></div>' +
            "</div>" +
            '<div class="space-y-5">' +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-3">Contact information</h3><div class="space-y-2.5 text-sm">' +
            '<div class="flex gap-2.5"><i data-lucide="map-pin" class="w-4 h-4 text-maroon mt-0.5"></i><span>University of Saint Anthony<br>1400 Mt. Carmel Ave., Brgy Del Rosario<br>Iriga City, Camarines Sur 4431</span></div>' +
            '<div class="flex gap-2.5"><i data-lucide="phone" class="w-4 h-4 text-maroon mt-0.5"></i><span>(054) 223-0912 ext. 116 <em class="text-xs text-muted">(sample)</em></span></div>' +
            '<div class="flex gap-2.5"><i data-lucide="mail" class="w-4 h-4 text-maroon mt-0.5"></i><span>library@usant.edu.ph <em class="text-xs text-muted">(sample)</em></span></div>' +
            "</div></div>" +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-3 flex items-center gap-2"><i data-lucide="help-circle" class="w-4 h-4 text-maroon"></i> Frequently asked questions</h3><div class="space-y-2">' +
            DB.get("faq")
              .map(
                (f) =>
                  '<details class="border border-ink/8 rounded-lg px-3 py-2 group"><summary class="text-sm font-semibold cursor-pointer list-none flex justify-between items-center">' +
                  esc(f.q) +
                  '<i data-lucide="chevron-down" class="w-4 h-4 text-muted transition group-open:rotate-180"></i></summary><p class="text-xs text-muted mt-2 leading-relaxed">' +
                  esc(f.a) +
                  "</p></details>",
              )
              .join("") +
            "</div></div>" +
            "</div>" +
            "</div>";
          lucide.createIcons();
          document.getElementById("hrs-body").innerHTML = DB.get("hours")
            .map(function (h, i) {
              return (
                "<tr><td>" +
                UI.deptBadge(h.dept) +
                '</td><td class="font-medium">' +
                esc(h.weekdays) +
                "</td><td>" +
                esc(h.saturday) +
                "</td><td>" +
                esc(h.sunday) +
                "</td>" +
                (Session.atLeast(3)
                  ? '<td class="text-right"><button class="tbl-act" data-hrs="' +
                    h.dept +
                    '" title="Edit hours"><i data-lucide="pen-line" class="w-4 h-4"></i></button></td>'
                  : "") +
                "</tr>"
              );
            })
            .join("");
          document.querySelectorAll("[data-hrs]").forEach(function (b) {
            b.onclick = function () {
              const d = b.dataset.hrs;
              const h = DB.get("hours").find((x) => x.dept === d);
              UI.formModal({
                title: "Edit hours — " + deptName(d),
                icon: "clock",
                values: h,
                fields: [
                  {
                    name: "weekdays",
                    label: "Monday – Friday",
                    required: true,
                  },
                  { name: "saturday", label: "Saturday", required: true },
                  { name: "sunday", label: "Sunday", required: true },
                ],
                onSubmit: function (v, close) {
                  const arr = DB.get("hours");
                  arr.find((x) => x.dept === d).weekdays = v.weekdays;
                  arr.find((x) => x.dept === d).saturday = v.saturday;
                  arr.find((x) => x.dept === d).sunday = v.sunday;
                  DB.set("hours", arr);
                  DB.audit("Update", "Services", "Hours updated for " + d);
                  close();
                  UI.toast("Hours updated", "success");
                  App.rerender();
                },
              });
            };
          });
          document.getElementById("ann-list").innerHTML = DB.get(
            "announcements",
          )
            .map(function (a) {
              return (
                '<div class="border border-ink/8 rounded-lg p-3.5"><div class="flex justify-between items-start gap-2"><div class="font-semibold text-sm">' +
                esc(a.title) +
                '</div><div class="flex gap-1.5 items-center"><span class="text-[11px] text-muted whitespace-nowrap">' +
                fmtDate(a.date) +
                "</span>" +
                (Session.atLeast(3)
                  ? '<button class="tbl-act act-danger" data-delann="' +
                    a.id +
                    '" title="Remove"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>'
                  : "") +
                '</div></div><p class="text-xs text-muted mt-1">' +
                esc(a.body) +
                "</p></div>"
              );
            })
            .join("");
          document.querySelectorAll("[data-delann]").forEach(function (b) {
            b.onclick = function () {
              UI.confirm({
                title: "Remove announcement",
                message: "Remove this announcement from the services page?",
                confirmText: "Remove",
                onConfirm: function () {
                  DB.remove("announcements", b.dataset.delann);
                  UI.toast("Announcement removed", "success");
                  App.rerender();
                },
              });
            };
          });
        };

        /* ---------- Module 2: Library Department Management ---------- */
        Modules.departments = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Library Departments",
              desc: "The five libraries of the University of Saint Anthony — administrators, scoped statistics and department settings.",
              actions: [
                {
                  label: "Compare in reports",
                  icon: "bar-chart-3",
                  cls: "btn-outline",
                  onclick: "location.hash='#/reports'",
                },
              ],
            }) +
            '<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-5" id="dept-grid"></div>';
          lucide.createIcons();
          document.getElementById("dept-grid").innerHTML = DEPARTMENTS.map(
            function (d) {
              const bk = DB.get("books").filter((b) => b.dept === d.id);
              const ln = DB.get("loans").filter((l) => l.dept === d.id);
              const pt = DB.get("patrons").filter((p) => p.dept === d.id);
              const isActive = Session.dept() === d.id;
              return (
                '<div class="card overflow-hidden ' +
                (isActive ? "ring-2 ring-gold" : "") +
                '">' +
                '<div class="h-1.5" style="background:' +
                d.color +
                '"></div>' +
                '<div class="p-5"><div class="flex items-start justify-between gap-2 mb-1"><h3 class="font-serif font-bold text-lg leading-tight">' +
                esc(d.name) +
                "</h3>" +
                (isActive
                  ? '<span class="badge badge-gold">current</span>'
                  : "") +
                "</div>" +
                '<div class="text-xs text-muted mb-4"><i data-lucide="map-pin" class="w-3 h-3 inline"></i> ' +
                esc(d.floor) +
                "</div>" +
                '<div class="grid grid-cols-2 gap-2 text-center mb-4">' +
                '<div class="bg-warm rounded-lg p-2.5"><div class="font-serif text-lg font-bold">' +
                bk.reduce((s, b) => s + b.copies, 0) +
                '</div><div class="text-[10px] uppercase tracking-wide text-muted">Copies</div></div>' +
                '<div class="bg-warm rounded-lg p-2.5"><div class="font-serif text-lg font-bold">' +
                pt.length +
                '</div><div class="text-[10px] uppercase tracking-wide text-muted">Patrons</div></div>' +
                '<div class="bg-warm rounded-lg p-2.5"><div class="font-serif text-lg font-bold">' +
                ln.filter((l) => loanStatus(l) !== "returned").length +
                '</div><div class="text-[10px] uppercase tracking-wide text-muted">On loan</div></div>' +
                '<div class="bg-warm rounded-lg p-2.5"><div class="font-serif text-lg font-bold ' +
                (ln.some((l) => loanStatus(l) === "overdue")
                  ? "text-red-700"
                  : "text-green-700") +
                '">' +
                ln.filter((l) => loanStatus(l) === "overdue").length +
                '</div><div class="text-[10px] uppercase tracking-wide text-muted">Overdue</div></div>' +
                "</div>" +
                '<div class="flex items-center gap-2.5 mb-4"><span class="avatar avatar-sm" style="background:' +
                d.color +
                ';color:#FFD25E">' +
                initials(d.head) +
                '</span><div class="text-xs"><div class="font-semibold">' +
                esc(d.head) +
                '</div><div class="text-muted">Head librarian</div></div></div>' +
                '<div class="flex gap-2"><button class="btn btn-outline btn-sm flex-1 justify-center" data-switch="' +
                d.id +
                '"><i data-lucide="corner-down-right" class="w-3.5 h-3.5"></i> Switch scope</button>' +
                (Session.atLeast(3)
                  ? '<button class="btn btn-ghost btn-sm" data-edit="' +
                    d.id +
                    '"><i data-lucide="pen-line" class="w-3.5 h-3.5"></i></button>'
                  : "") +
                "</div></div></div>"
              );
            },
          ).join("");
          lucide.createIcons();
          document.querySelectorAll("[data-switch]").forEach(function (b) {
            b.onclick = function () {
              Session.setDept(b.dataset.switch);
              DB.audit(
                "Filter",
                "Departments",
                "Scope → " + deptName(b.dataset.switch),
              );
              UI.toast("Now viewing " + deptName(b.dataset.switch), "info");
              App.renderTopbar();
              App.rerender();
            };
          });
          document.querySelectorAll("[data-edit]").forEach(function (b) {
            b.onclick = function () {
              const d = DEPARTMENTS.find((x) => x.id === b.dataset.edit);
              UI.formModal({
                title: "Department settings",
                subtitle: d.name,
                icon: "building-2",
                values: d,
                fields: [
                  {
                    name: "name",
                    label: "Department name",
                    required: true,
                    span: 2,
                  },
                  { name: "head", label: "Head librarian", required: true },
                  { name: "floor", label: "Location", required: true },
                  {
                    name: "loanDays",
                    label: "Custom loan days (optional)",
                    type: "number",
                    min: 1,
                    value: "",
                  },
                  { name: "notes", label: "Notes", type: "textarea", span: 2 },
                ],
                onSubmit: function (v, close) {
                  d.name = v.name;
                  d.head = v.head;
                  d.floor = v.floor;
                  Store.set("departments", DEPARTMENTS);
                  DB.audit("Update", "Departments", d.id + " settings updated");
                  close();
                  UI.toast("Department settings saved", "success");
                  App.rerender();
                },
              });
            };
          });
        };

        /* ---------- Module 20: Administration & Audit ---------- */
        Modules.administration = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Administration & Audit Logs",
              desc: "User accounts, role permissions, department configuration, audit trail and login history.",
              actions: [
                {
                  label: "Add user",
                  icon: "user-plus",
                  cls: "btn-primary",
                  minLevel: 4,
                  onclick: "userNew()",
                },
              ],
            }) +
            '<div class="tabs mb-5" id="ad-tabs"><button class="tab-btn active" data-t="users">Users & accounts</button><button class="tab-btn" data-t="roles">Roles & permissions</button><button class="tab-btn" data-t="audit">Audit logs</button><button class="tab-btn" data-t="logins">Login history</button></div><div id="ad-body"></div>';
          lucide.createIcons();
          function users() {
            document.getElementById("ad-body").innerHTML =
              '<div class="card" id="ad-users"></div>';
            UI.renderTable("#ad-users", {
              columns: [
                {
                  key: "name",
                  label: "User",
                  render: (u) =>
                    '<div class="flex items-center gap-2.5"><span class="avatar avatar-sm">' +
                    initials(u.name) +
                    '</span><div><div class="font-semibold">' +
                    esc(u.name) +
                    '</div><div class="text-[11px] text-muted">' +
                    esc(u.email) +
                    "</div></div></div>",
                },
                {
                  key: "role",
                  label: "Role",
                  render: (u) =>
                    UI.badge(
                      (ROLES.find((r) => r.id === u.role) || {}).label ||
                        u.role,
                      "maroon",
                    ),
                },
                {
                  key: "dept",
                  label: "Department",
                  render: (u) =>
                    u.dept === "all"
                      ? UI.badge("All departments", "gold")
                      : UI.deptBadge(u.dept),
                },
                { key: "phone", label: "Phone", cls: "hidden md:table-cell" },
                {
                  key: "lastLogin",
                  label: "Last login",
                  render: (u) => esc(u.lastLogin || "—"),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (u) => UI.statusBadge(u.status),
                },
              ],
              rows: () => DB.get("users"),
              deptScope: false,
              searchKeys: ["name", "email"],
              searchPlaceholder: "Search users…",
              filters: [
                {
                  key: "role",
                  label: "All roles",
                  options: ROLES.map((r) => ({ v: r.id, l: r.label })),
                },
                {
                  key: "status",
                  label: "Any status",
                  options: [
                    { v: "active", l: "Active" },
                    { v: "inactive", l: "Inactive" },
                  ],
                },
              ],
              actions: [
                {
                  icon: "pen-line",
                  label: "Edit",
                  onClick: (u) => userEdit(u.id),
                },
                {
                  icon: "key-round",
                  label: "Reset password (simulated)",
                  onClick: (u) =>
                    UI.confirm({
                      title: "Reset password",
                      message:
                        "Reset the password of <strong>" +
                        esc(u.name) +
                        "</strong> to the demo default <code>usant123</code>?",
                      danger: false,
                      confirmText: "Reset",
                      onConfirm: function () {
                        DB.update("users", u.id, { password: "usant123" });
                        DB.audit("Password reset", "Administration", u.id);
                        UI.toast(
                          "Password reset to demo default (simulated)",
                          "success",
                        );
                      },
                    }),
                },
                {
                  icon: "power",
                  label: "Activate / deactivate",
                  onClick: (u) => {
                    const next = u.status === "active" ? "inactive" : "active";
                    DB.update("users", u.id, { status: next });
                    DB.audit("Update", "Administration", u.id + " → " + next);
                    UI.toast("Account " + next, "info");
                    App.rerender();
                  },
                },
                {
                  icon: "history",
                  label: "Activity",
                  onClick: (u) => {
                    const logs = DB.get("audit").filter(
                      (a) =>
                        a.user === u.name.replace(/(Dr\.|Ms\.|Mr\.)\s*/, "") ||
                        a.user === u.name,
                    );
                    UI.modal({
                      title: "Activity — " + esc(u.name),
                      subtitle: logs.length + " audit entries",
                      size: "lg",
                      body: logs.length
                        ? '<div class="space-y-2 max-h-96 overflow-y-auto">' +
                          logs
                            .map(
                              (a) =>
                                '<div class="border border-ink/8 rounded-lg p-2.5 text-sm"><div class="flex justify-between"><span class="font-semibold">' +
                                esc(a.action) +
                                ' <span class="text-muted font-normal">· ' +
                                esc(a.module) +
                                '</span></span><span class="text-[11px] text-muted font-mono">' +
                                esc(a.ts) +
                                '</span></div><div class="text-xs text-muted mt-0.5">' +
                                esc(a.detail) +
                                "</div></div>",
                            )
                            .join("") +
                          "</div>"
                        : '<div class="empty"><i data-lucide="history"></i><p>No recorded activity</p></div>',
                      footer:
                        "<button class=\"btn btn-outline\" onclick=\"document.getElementById('modal-root').innerHTML=''\">Close</button>",
                    });
                    lucide.createIcons();
                  },
                },
              ],
            });
          }
          function roles() {
            const P = Store.get("permissions", SEED.permissions);
            const mods = Object.keys(P);
            const roles = ROLES.filter((r) => r.level > 0);
            document.getElementById("ad-body").innerHTML =
              '<div class="card p-4"><div class="flex flex-wrap items-center justify-between gap-3 mb-4"><div><h3 class="font-serif font-bold">Permission matrix</h3><p class="text-xs text-muted mt-0.5">Access levels per module and role. Frontend demonstration only — not real security enforcement.</p></div><button class="btn btn-primary btn-sm" id="perm-save"><i data-lucide="save" class="w-3.5 h-3.5"></i> Save matrix (simulated)</button></div>' +
              '<div class="overflow-x-auto"><table class="tbl w-full"><thead><tr><th>Module</th>' +
              roles
                .map((r) => '<th class="text-center">' + r.label + "</th>")
                .join("") +
              "</tr></thead><tbody>" +
              mods
                .map(function (m) {
                  return (
                    '<tr><td class="font-medium">' +
                    esc(m) +
                    "</td>" +
                    roles
                      .map(function (r) {
                        return (
                          '<td class="text-center"><input type="checkbox" data-p="' +
                          m +
                          "|" +
                          r.id +
                          '" ' +
                          (P[m] && P[m][r.id] ? "checked" : "") +
                          ' class="w-4 h-4" style="accent-color:#7D1519"></td>'
                        );
                      })
                      .join("") +
                    "</tr>"
                  );
                })
                .join("") +
              "</tbody></table></div></div>";
            document.getElementById("perm-save").onclick = function () {
              const np = {};
              mods.forEach(function (m) {
                np[m] = {};
                roles.forEach(function (r) {
                  const cb = document.querySelector(
                    '[data-p="' + m + "|" + r.id + '"]',
                  );
                  np[m][r.id] = cb ? cb.checked : false;
                });
              });
              Store.set("permissions", np);
              DB.audit(
                "Update",
                "Administration",
                "Permission matrix saved (simulated)",
              );
              UI.toast("Permission matrix saved (simulated)", "success");
            };
          }
          function audit() {
            document.getElementById("ad-body").innerHTML =
              '<div class="card" id="ad-audit"></div>';
            const tbl = UI.renderTable("#ad-audit", {
              columns: [
                {
                  key: "ts",
                  label: "Timestamp",
                  render: (a) =>
                    '<span class="font-mono text-xs">' + esc(a.ts) + "</span>",
                },
                { key: "user", label: "User" },
                {
                  key: "action",
                  label: "Action",
                  render: (a) => UI.badge(a.action, "maroon"),
                },
                { key: "module", label: "Module" },
                {
                  key: "detail",
                  label: "Detail",
                  render: (a) =>
                    '<span class="text-xs text-muted">' +
                    esc(a.detail) +
                    "</span>",
                },
                {
                  key: "ip",
                  label: "IP",
                  cls: "hidden md:table-cell",
                  render: (a) =>
                    '<span class="font-mono text-xs">' + esc(a.ip) + "</span>",
                },
              ],
              rows: () => DB.get("audit"),
              deptScope: false,
              searchKeys: ["user", "action", "module", "detail"],
              searchPlaceholder: "Search audit log…",
              pageSize: 12,
              filters: [
                {
                  key: "module",
                  label: "All modules",
                  options: [
                    ...new Set(DB.get("audit").map((a) => a.module)),
                  ].sort(),
                },
              ],
              toolbarExtra:
                '<button class="btn btn-outline btn-sm ml-auto" id="ad-ex"><i data-lucide="download" class="w-3.5 h-3.5"></i> Export CSV</button>',
            });
            document.getElementById("ad-ex").onclick = function () {
              UI.exportCSV("audit_log", DB.get("audit"));
            };
          }
          function logins() {
            document.getElementById("ad-body").innerHTML =
              '<div class="card" id="ad-logins"></div>';
            UI.renderTable("#ad-logins", {
              columns: [
                {
                  key: "ts",
                  label: "Timestamp",
                  render: (l) =>
                    '<span class="font-mono text-xs">' + esc(l.ts) + "</span>",
                },
                { key: "user", label: "Account" },
                {
                  key: "role",
                  label: "Role",
                  render: (l) => UI.badge(l.role, "gold"),
                },
                {
                  key: "status",
                  label: "Result",
                  render: (l) =>
                    l.status === "success"
                      ? UI.badge("success", "green")
                      : UI.badge("failed", "red"),
                },
                {
                  key: "ip",
                  label: "IP address",
                  render: (l) =>
                    '<span class="font-mono text-xs">' + esc(l.ip) + "</span>",
                },
              ],
              rows: () => DB.get("logins"),
              deptScope: false,
              searchKeys: ["user"],
              searchPlaceholder: "Search logins…",
              pageSize: 10,
            });
          }
          const tabs = {
            users: users,
            roles: roles,
            audit: audit,
            logins: logins,
          };
          users();
          document.querySelectorAll("#ad-tabs .tab-btn").forEach(function (b) {
            b.onclick = function () {
              document
                .querySelectorAll("#ad-tabs .tab-btn")
                .forEach((x) => x.classList.remove("active"));
              b.classList.add("active");
              tabs[b.dataset.t]();
              lucide.createIcons();
            };
          });
        };
        function userFields(v) {
          v = v || {};
          return [
            { name: "name", label: "Full name", required: true, span: 2 },
            { name: "email", label: "Email", type: "email", required: true },
            { name: "phone", label: "Phone" },
            {
              name: "role",
              label: "Role",
              type: "select",
              required: true,
              options: ROLES.map((r) => ({ v: r.id, l: r.label })),
            },
            {
              name: "dept",
              label: "Department scope",
              type: "select",
              required: true,
              options: [{ v: "all", l: "All departments" }].concat(deptOpts()),
            },
            {
              name: "status",
              label: "Account status",
              type: "select",
              options: [
                { v: "active", l: "Active" },
                { v: "inactive", l: "Inactive" },
              ],
            },
            {
              name: "password",
              label: "Password",
              required: !v.id,
              placeholder: v.id
                ? "Leave blank to keep current"
                : "Demo default: usant123",
            },
          ];
        }
        window.userNew = function () {
          UI.formModal({
            title: "Add user account",
            subtitle: "Simulated account management",
            icon: "user-plus",
            submitText: "Create account",
            values: { role: "librarian", dept: "college", status: "active" },
            fields: userFields({}),
            onSubmit: function (v, close) {
              if (
                DB.get("users").some(
                  (u) => u.email.toLowerCase() === v.email.toLowerCase(),
                )
              ) {
                UI.toast("An account with this email already exists", "error");
                return;
              }
              DB.add("users", {
                id: uid("U"),
                name: v.name,
                email: v.email,
                phone: v.phone,
                role: v.role,
                dept: v.dept,
                status: v.status,
                password: v.password || "usant123",
                created: todayStr(),
                lastLogin: "—",
                patronId: "",
              });
              DB.audit(
                "Create",
                "Administration",
                "User account created: " + v.email,
              );
              close();
              UI.toast("User account created (simulated)", "success");
              App.rerender();
            },
          });
        };
        window.userEdit = function (id) {
          const u = DB.get("users").find((x) => x.id === id);
          if (!u) return;
          UI.formModal({
            title: "Edit user",
            subtitle: esc(u.email),
            icon: "pen-line",
            submitText: "Save changes",
            values: u,
            fields: userFields(u),
            onSubmit: function (v, close) {
              DB.update("users", id, {
                name: v.name,
                email: v.email,
                phone: v.phone,
                role: v.role,
                dept: v.dept,
                status: v.status,
                password: v.password || u.password,
              });
              DB.audit("Update", "Administration", "User updated: " + id);
              close();
              UI.toast("User updated", "success");
              if (id === Session.get().userId) {
                setTimeout(() => location.reload(), 500);
              } else App.rerender();
            },
          });
        };

        /* ---------- Settings (preferences & policies) ---------- */
        Modules.settings = function (el) {
          const S = settings();
          const P = Store.get("prefs", SEED.prefs);
          el.innerHTML =
            UI.pageHead({
              title: "Settings",
              desc: "Interface preferences and default circulation policy values for this prototype.",
            }) +
            '<div class="grid lg:grid-cols-2 gap-5">' +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-4">Interface preferences</h3><div class="grid grid-cols-2 gap-4">' +
            '<div><label class="label">Rows per page</label><select id="set-per" class="input w-full">' +
            [8, 10, 15, 25]
              .map(
                (n) =>
                  "<option " +
                  (P.perPage === n ? "selected" : "") +
                  ">" +
                  n +
                  "</option>",
              )
              .join("") +
            "</select></div>" +
            '<div><label class="label">Density</label><select id="set-den" class="input w-full"><option value="comfortable" ' +
            (P.density === "comfortable" ? "selected" : "") +
            '>Comfortable</option><option value="compact" ' +
            (P.density === "compact" ? "selected" : "") +
            ">Compact</option></select></div>" +
            '<div class="col-span-2"><label class="label">Default department on login</label><select id="set-dept" class="input w-full"><option value="all">All departments</option>' +
            deptOpts()
              .map(
                (d) =>
                  '<option value="' +
                  d.v +
                  '" ' +
                  (P.defaultDept === d.v ? "selected" : "") +
                  ">" +
                  esc(d.l) +
                  "</option>",
              )
              .join("") +
            "</select></div>" +
            '<label class="flex items-center gap-2 text-sm col-span-2"><input id="set-email" type="checkbox" class="w-4 h-4" style="accent-color:#7D1519" ' +
            (P.emailNotifs ? "checked" : "") +
            "> Email notifications for approvals (simulated)</label>" +
            '<label class="flex items-center gap-2 text-sm col-span-2"><input id="set-auto" type="checkbox" class="w-4 h-4" style="accent-color:#7D1519" ' +
            (P.autoOverdueNotices ? "checked" : "") +
            "> Automatically queue overdue notices each morning (simulated)</label>" +
            '</div><button class="btn btn-primary mt-5" id="set-save-prefs"><i data-lucide="save" class="w-4 h-4"></i> Save preferences</button></div>' +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-4">Circulation policy defaults</h3><div class="grid grid-cols-2 gap-4">' +
            '<div><label class="label">Fine per day (₱)</label><input id="set-fine" class="input w-full" type="number" min="0" step="0.5" value="' +
            S.finePerDay +
            '"></div>' +
            '<div><label class="label">Hold shelf days</label><input id="set-hold" class="input w-full" type="number" min="1" value="' +
            S.holdDays +
            '"></div>' +
            '<div><label class="label">Student loan days</label><input id="set-ls" class="input w-full" type="number" min="1" value="' +
            S.loanDaysStudent +
            '"></div>' +
            '<div><label class="label">Faculty loan days</label><input id="set-lf" class="input w-full" type="number" min="1" value="' +
            S.loanDaysFaculty +
            '"></div>' +
            '<div><label class="label">Student book limit</label><input id="set-ms" class="input w-full" type="number" min="1" value="' +
            S.maxBooksStudent +
            '"></div>' +
            '<div><label class="label">Faculty book limit</label><input id="set-mf" class="input w-full" type="number" min="1" value="' +
            S.maxBooksFaculty +
            '"></div>' +
            '<div class="col-span-2"><label class="label">Max renewals</label><input id="set-mr" class="input w-full" type="number" min="0" value="' +
            S.maxRenewals +
            '"></div>' +
            '</div><button class="btn btn-primary mt-5" id="set-save-policy"><i data-lucide="save" class="w-4 h-4"></i> Save policy defaults</button></div>' +
            '<div class="card p-5 lg:col-span-2 !border-red-200"><h3 class="font-serif font-bold text-red-800 mb-2 flex items-center gap-2"><i data-lucide="alert-triangle" class="w-4 h-4"></i> Danger zone</h3><p class="text-xs text-muted mb-4">Restore every dataset (books, patrons, loans, reservations, fines, settings…) to the original seeded state. Local changes made during this demo will be lost.</p><button class="btn btn-danger" id="set-reset"><i data-lucide="rotate-ccw" class="w-4 h-4"></i> Reset all demo data</button></div>' +
            "</div>";
          lucide.createIcons();
          document.getElementById("set-save-prefs").onclick = function () {
            Store.set("prefs", {
              perPage: Number(document.getElementById("set-per").value),
              density: document.getElementById("set-den").value,
              defaultDept: document.getElementById("set-dept").value,
              emailNotifs: document.getElementById("set-email").checked,
              autoOverdueNotices: document.getElementById("set-auto").checked,
              browserNotifs: P.browserNotifs,
            });
            DB.audit("Update", "Settings", "Interface preferences saved");
            UI.toast("Preferences saved", "success");
          };
          document.getElementById("set-save-policy").onclick = function () {
            DB.set("settings", {
              finePerDay:
                Number(document.getElementById("set-fine").value) || 2,
              holdDays: Number(document.getElementById("set-hold").value) || 3,
              loanDaysStudent:
                Number(document.getElementById("set-ls").value) || 7,
              loanDaysFaculty:
                Number(document.getElementById("set-lf").value) || 14,
              maxBooksStudent:
                Number(document.getElementById("set-ms").value) || 3,
              maxBooksFaculty:
                Number(document.getElementById("set-mf").value) || 5,
              maxRenewals: Number(document.getElementById("set-mr").value) || 2,
            });
            DB.audit("Update", "Settings", "Circulation policy defaults saved");
            UI.toast(
              "Policy defaults saved — circulation now uses the new values",
              "success",
            );
          };
          document.getElementById("set-reset").onclick = function () {
            UI.confirm({
              title: "Reset all demo data",
              message:
                "This clears localStorage and restores the original sample datasets. Continue?",
              confirmText: "Reset everything",
              onConfirm: function () {
                Seed.reset();
                UI.toast("Demo data restored", "success");
                setTimeout(() => location.reload(), 600);
              },
            });
          };
        };

        /* ---------- Module 21: Import / Export ---------- */
        Modules["import-export"] = function (el) {
          el.innerHTML =
            UI.pageHead({
              title: "Import / Export",
              desc: "Bulk import and export of catalog, patron and transaction records. All operations run locally in the browser; nothing is uploaded anywhere.",
            }) +
            '<div class="grid lg:grid-cols-2 gap-5">' +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-1 flex items-center gap-2"><i data-lucide="file-up" class="w-4 h-4 text-maroon"></i> Import records</h3><p class="text-xs text-muted mb-4">Upload a CSV file, preview and validate it, then commit rows to the local prototype dataset.</p>' +
            '<div class="space-y-3">' +
            '<div><label class="label">Record type</label><select id="im-type" class="input w-full"><option value="books">Books / bibliographic records</option><option value="patrons">Patron records</option></select></div>' +
            '<div><label class="label">CSV file</label><input id="im-file" type="file" accept=".csv,text/csv" class="input w-full !py-1.5"></div>' +
            '<div class="flex gap-2 flex-wrap"><button class="btn btn-outline btn-sm" id="im-sample"><i data-lucide="file-down" class="w-3.5 h-3.5"></i> Download sample CSV</button><button class="btn btn-outline btn-sm" id="im-demo"><i data-lucide="wand-2" class="w-3.5 h-3.5"></i> Load demo rows</button></div>' +
            '<div id="im-preview" class="hidden"><div class="label mt-2">Preview & validation</div><div id="im-val" class="text-xs mb-2"></div><div class="overflow-x-auto max-h-56 border border-ink/10 rounded-lg" id="im-tbl"></div>' +
            '<div class="flex gap-2 mt-3"><button class="btn btn-primary btn-sm" id="im-commit"><i data-lucide="database" class="w-3.5 h-3.5"></i> Commit import</button><button class="btn btn-ghost btn-sm" id="im-cancel">Cancel</button></div></div>' +
            "</div></div>" +
            '<div class="card p-5"><h3 class="font-serif font-bold mb-1 flex items-center gap-2"><i data-lucide="file-down" class="w-4 h-4 text-maroon"></i> Export data</h3><p class="text-xs text-muted mb-4">CSV exports are real browser downloads generated from the current prototype data.</p>' +
            '<div class="grid sm:grid-cols-2 gap-3">' +
            [
              [
                "library_catalog",
                "Catalog (all books)",
                DB.get("books").length,
                "library",
              ],
              [
                "patron_records",
                "Patron records",
                DB.get("patrons").length,
                "users",
              ],
              [
                "loan_transactions",
                "Loan transactions",
                DB.get("loans").length,
                "repeat",
              ],
              [
                "reservation_records",
                "Reservations",
                DB.get("reservations").length,
                "bookmark",
              ],
              [
                "fine_payments",
                "Fine payments",
                DB.get("payments").length,
                "banknote",
              ],
              ["audit_log", "Audit log", DB.get("audit").length, "scroll-text"],
            ]
              .map(function (x) {
                return (
                  '<button class="border border-ink/10 rounded-lg p-3.5 text-left hover:border-maroon/40 hover:shadow-sm transition" data-exp="' +
                  x[0] +
                  '"><div class="flex items-center justify-between"><span class="stat-ic !w-8 !h-8 !rounded-lg" style="background:#FFF1D6;color:#8A5A00"><i data-lucide="' +
                  x[3] +
                  '" class="w-4 h-4"></i></span><span class="text-[11px] text-muted">' +
                  x[2] +
                  ' rows</span></div><div class="font-semibold text-sm mt-2">' +
                  x[1] +
                  '</div><div class="text-[11px] text-maroon font-medium mt-0.5">Download CSV →</div></button>'
                );
              })
              .join("") +
            "</div>" +
            '<div class="mt-4 border-t border-ink/8 pt-4 flex gap-2 flex-wrap"><button class="btn btn-outline btn-sm" id="ex-json"><i data-lucide="braces" class="w-3.5 h-3.5"></i> Full JSON backup (all datasets)</button><button class="btn btn-ghost btn-sm" id="ex-pdf"><i data-lucide="file-text" class="w-3.5 h-3.5"></i> PDF report (simulated)</button></div>' +
            '<p class="text-[11px] text-muted mt-3">In production, exports will be generated server-side from Koha’s authoritative data. Here they come from your browser’s localStorage.</p>' +
            "</div>" +
            "</div>";
          lucide.createIcons();
          const expMap = {
            library_catalog: () => ["books", DB.get("books")],
            patron_records: () => ["patrons", DB.get("patrons")],
            loan_transactions: () => ["loans", DB.get("loans")],
            reservation_records: () => ["reservations", DB.get("reservations")],
            fine_payments: () => ["payments", DB.get("payments")],
            audit_log: () => ["audit", DB.get("audit")],
          };
          document.querySelectorAll("[data-exp]").forEach(function (b) {
            b.onclick = function () {
              const [name, rows] = expMap[b.dataset.exp]();
              UI.exportCSV(name, rows);
              DB.audit(
                "Export",
                "Import/Export",
                name + " (" + rows.length + " rows)",
              );
            };
          });
          document.getElementById("ex-json").onclick = function () {
            const keys = [
              "books",
              "patrons",
              "loans",
              "reservations",
              "payments",
              "fines",
              "requests",
              "suppliers",
              "orders",
              "serials",
              "documents",
              "facilities",
              "bookings",
              "notifications",
              "audit",
              "users",
              "settings",
              "prefs",
            ];
            const dump = {};
            keys.forEach((k) => (dump[k] = DB.get(k)));
            UI.download(
              "usant_library_backup_" + todayStr() + ".json",
              JSON.stringify(dump, null, 1),
              "application/json",
            );
            UI.toast("Full JSON backup downloaded", "success");
          };
          document.getElementById("ex-pdf").onclick = function () {
            UI.toast(
              "PDF export simulated — production will render server-side reports.",
              "info",
            );
          };
          document.getElementById("im-sample").onclick = function () {
            const t = document.getElementById("im-type").value;
            if (t === "books")
              UI.download(
                "sample_books_import.csv",
                "title,author,publisher,year,isbn,subject,callNo,dept,copies,shelf\nSample Title One,Author A,Publisher X,2026,978-0-00-000000-1,General,000 SAM,college,2,SAMPLE-01\nSample Title Two,Author B,Publisher Y,2025,978-0-00-000000-2,General,000 SAM2,shs,1,SAMPLE-02",
                "text/csv",
              );
            else
              UI.download(
                "sample_patrons_import.csv",
                "type,no,name,email,program,year,dept,phone\nstudent,2026-09001,Juan Dela Cruz,jdelacruz@student.usant.edu.ph,BS Nursing,1st Year,college,0917-000-0000\nfaculty,T-0999,Dra. Ana Reyes,ana.reyes@usant.edu.ph,College of Education,Faculty,college,0918-000-0000",
                "text/csv",
              );
          };
          let pending = null;
          function showPreview(parsed, type) {
            pending = null;
            const req =
              type === "books"
                ? ["title", "author", "dept", "copies"]
                : ["no", "name", "dept", "type"];
            const errs = [];
            parsed.rows.forEach(function (r, i) {
              req.forEach(function (k) {
                if (!String(r[k] || "").trim())
                  errs.push({
                    row: i + 2,
                    error: "Missing required field “" + k + "”",
                  });
              });
              if (
                type === "books" &&
                r.isbn &&
                !/^[\d\-Xx ]{10,20}$/.test(r.isbn)
              )
                errs.push({
                  row: i + 2,
                  error: "ISBN format looks invalid: " + r.isbn,
                });
              if (
                type === "patrons" &&
                DB.get("patrons").some((p) => p.no === r.no)
              )
                errs.push({ row: i + 2, error: "Duplicate ID number " + r.no });
              if (
                type === "books" &&
                DB.get("books").some((b) => b.isbn && b.isbn === r.isbn)
              )
                errs.push({ row: i + 2, error: "Duplicate ISBN " + r.isbn });
            });
            const errRows = new Set(errs.map((e) => e.row));
            const valid = parsed.rows.filter((r, i) => !errRows.has(i + 2));
            document.getElementById("im-preview").classList.remove("hidden");
            document.getElementById("im-val").innerHTML =
              '<span class="badge badge-green">' +
              valid.length +
              ' valid</span> <span class="badge badge-red ml-1">' +
              errs.length +
              " issue(s)</span>" +
              (errs.length
                ? '<div class="mt-1.5 max-h-20 overflow-y-auto text-red-700">' +
                  errs
                    .slice(0, 6)
                    .map(
                      (e) =>
                        "<div>Row " + e.row + ": " + esc(e.error) + "</div>",
                    )
                    .join("") +
                  (errs.length > 6
                    ? "<div>…and " + (errs.length - 6) + " more</div>"
                    : "") +
                  "</div>"
                : "");
            document.getElementById("im-tbl").innerHTML =
              '<table class="tbl w-full"><thead><tr>' +
              parsed.headers.map((h) => "<th>" + esc(h) + "</th>").join("") +
              "<th>Result</th></tr></thead><tbody>" +
              parsed.rows
                .slice(0, 12)
                .map(function (r, i) {
                  return (
                    '<tr class="' +
                    (errRows.has(i + 2) ? "bg-red-50" : "") +
                    '">' +
                    parsed.headers
                      .map(
                        (h) =>
                          '<td class="text-xs">' +
                          esc(trunc(r[h] || "", 22)) +
                          "</td>",
                      )
                      .join("") +
                    "<td>" +
                    (errRows.has(i + 2)
                      ? UI.badge("invalid", "red")
                      : UI.badge("valid", "green")) +
                    "</td></tr>"
                  );
                })
                .join("") +
              "</tbody></table>";
            pending = { rows: valid, type: type };
            const c = document.getElementById("im-commit");
            if (!valid.length) {
              c.disabled = true;
            } else c.disabled = false;
            lucide.createIcons();
          }
          document.getElementById("im-file").onchange = function () {
            const f = this.files && this.files[0];
            if (!f) return;
            const rd = new FileReader();
            rd.onload = function (e) {
              const parsed = UI.parseCSV(e.target.result);
              if (!parsed.rows.length) {
                UI.toast("CSV appears to be empty", "error");
                return;
              }
              showPreview(parsed, document.getElementById("im-type").value);
              UI.toast(
                "Parsed " + parsed.rows.length + " rows from " + f.name,
                "info",
              );
            };
            rd.readAsText(f);
          };
          document.getElementById("im-demo").onclick = function () {
            const type = document.getElementById("im-type").value;
            const csv =
              type === "books"
                ? "title,author,publisher,year,isbn,subject,callNo,dept,copies,shelf\nDatabase System Concepts,Silberschatz,McGraw-Hill,2020,978-0-07-813660-3,Computer Science,005.74 SIL," +
                  (Session.dept() === "all" ? "college" : Session.dept()) +
                  ",2,IT-DB-01\nAng Tatibubong Bayan,Ninoy Aquino?,Sample Press,2019,978-0-00-111111-1,Philippine Literature,899.211 TRI," +
                  (Session.dept() === "all" ? "college" : Session.dept()) +
                  ",1,FIL-LIT-09"
                : "type,no,name,email,program,year,dept,phone\nstudent,2026-09001,Juan Dela Cruz,jdelacruz@student.usant.edu.ph,BS Nursing,1st Year," +
                  (Session.dept() === "all" ? "college" : Session.dept()) +
                  ",0917-000-0000\nstudent,2026-09002,Ana Marie Santos,amsantos@student.usant.edu.ph,BSIT,1st Year," +
                  (Session.dept() === "all" ? "college" : Session.dept()) +
                  ",0918-000-0000";
            showPreview(UI.parseCSV(csv), type);
            UI.toast("Demo rows loaded", "info");
          };
          document.getElementById("im-cancel").onclick = function () {
            document.getElementById("im-preview").classList.add("hidden");
            pending = null;
            document.getElementById("im-file").value = "";
          };
          document.getElementById("im-commit").onclick = function () {
            if (!pending || !pending.rows.length) return;
            if (pending.type === "books") {
              pending.rows.forEach(function (r) {
                DB.add("books", {
                  id: uid("BK"),
                  title: r.title,
                  author: r.author,
                  publisher: r.publisher || "—",
                  year: Number(r.year) || 2026,
                  isbn: r.isbn || "—",
                  subject: r.subject || "General",
                  callNo: r.callNo || "000 NEW",
                  dewey: "000",
                  dept: r.dept,
                  copies: Number(r.copies) || 1,
                  available: Number(r.copies) || 1,
                  shelf: r.shelf || "IMPORT",
                  popularity: 0,
                  status: "processing",
                  edition: "1st",
                  dateAdded: todayStr(),
                  source: "csv-import",
                });
              });
            } else {
              pending.rows.forEach(function (r) {
                DB.add("patrons", {
                  id: uid("P"),
                  type: r.type || "student",
                  no: r.no,
                  name: r.name,
                  email: r.email,
                  program: r.program || "—",
                  year: r.year || "—",
                  dept: r.dept,
                  phone: r.phone || "—",
                  joined: todayStr(),
                  status: "active",
                  portalAccess: true,
                });
              });
            }
            DB.audit(
              "Import",
              "Import/Export",
              pending.rows.length +
                " " +
                pending.type +
                " records imported from CSV",
            );
            logActivity(
              pending.rows.length + " " + pending.type + " records imported",
              "catalogue",
            );
            UI.toast(
              pending.rows.length + " records imported successfully",
              "success",
            );
            document.getElementById("im-preview").classList.add("hidden");
            pending = null;
            document.getElementById("im-file").value = "";
          };
        };
      })();

      /* FILE: js/student.js — Module 15: Student Self-Service Portal */
      const SP = {
        patron: null,
        demo: false,
        init() {
          Seed.init();
          if (window.Chart) {
            Chart.defaults.font.family = "Inter, sans-serif";
            Chart.defaults.color = "#6B625F";
          }
          const s = Session.get();
          let pid = Session.patronId();
          if (!pid) {
            pid = "P-1001";
            SP.demo = true;
          }
          SP.patron =
            DB.get("patrons").find((p) => p.id === pid) || DB.get("patrons")[0];
          if (SP.demo)
            document
              .getElementById("sp-demo-banner")
              .classList.remove("hidden");
          SP.renderNav();
          SP.bindChrome();
          window.addEventListener("hashchange", SP.route);
          SP.route();
        },
        navItems: [
          ["dashboard", "Home", "house"],
          ["catalog", "Catalog", "search"],
          ["loans", "My Loans", "book-open"],
          ["reservations", "Reservations", "bookmark"],
          ["fines", "Fines", "banknote"],
          ["notifications", "Notices", "bell"],
          ["services", "Library Info", "library"],
          ["profile", "Profile", "user-round"],
        ],
        renderNav() {
          document.getElementById("sp-nav").innerHTML = SP.navItems
            .map(
              (n) =>
                '<a class="sp-link" href="#/' +
                n[0] +
                '" data-sp="' +
                n[0] +
                '"><i data-lucide="' +
                n[2] +
                '" class="w-4 h-4"></i>' +
                n[1] +
                "</a>",
            )
            .join("");
          const u = Session.user();
          document.getElementById("sp-avatar").textContent = initials(
            SP.patron.name,
          );
          document.getElementById("sp-user-name").textContent = u
            ? u.name.split(" ")[0]
            : SP.patron.name.split(" ")[0];
          document.getElementById("sp-menu-name").textContent = SP.patron.name;
          document.getElementById("sp-menu-sub").textContent =
            SP.patron.no + " · " + SP.patron.program;
          const al = document.getElementById("sp-admin-link");
          if (!u || u.role === "student") {
            al.style.display = "none";
          } else {
            al.onclick = null;
            al.onclick = function (e) { e.preventDefault(); Proto.screen('admin'); };
          }
          SP.updateBell();
          lucide.createIcons();
        },
        updateBell() {
          const n = SP.notifications().filter((x) => !x.read).length;
          const d = document.getElementById("sp-bell-dot");
          if (d) d.classList.toggle("hidden", n === 0);
        },
        notifications() {
          return DB.get("notifications").filter(
            (n) =>
              ["all", "college", SP.patron.dept, "student"].includes(
                n.audience,
              ) || n.audience === "all",
          );
        },
        bindChrome() {
          document.getElementById("sp-menu-btn").onclick = function () {
            document.getElementById("sp-nav").classList.toggle("open");
          };
          document.getElementById("sp-logout").onclick = function () {
            if (Session.get()) {
              Auth.logout();
            } else {
              Proto.screen("login"); location.hash = "";
            }
          };
          document.getElementById("sp-bell").onclick = function () {
            location.hash = "#/notifications";
          };
          document.getElementById("sp-user-btn").onclick = function (e) {
            e.stopPropagation();
            document.getElementById("sp-user-menu").classList.toggle("hidden");
          };
          document.addEventListener("click", function (e) {
            if (!e.target.closest(".relative"))
              document.getElementById("sp-user-menu").classList.add("hidden");
          });
        },
        route() {
          if (Proto.active !== "student") return;
          document.getElementById("sp-nav").classList.remove("open");
          document.getElementById("sp-user-menu").classList.add("hidden");
          const id = location.hash.replace(/^#\/?/, "") || "dashboard";
          document
            .querySelectorAll("[data-sp]")
            .forEach((a) => a.classList.toggle("active", a.dataset.sp === id));
          const view = document.getElementById("sp-view");
          UI.clearTimers();
          if (!SP.pages[id]) {
            view.innerHTML =
              '<div class="card p-10 text-center"><i data-lucide="compass" class="w-9 h-9 mx-auto text-muted mb-2"></i><p class="font-serif font-bold">Page not found</p></div>';
            lucide.createIcons();
            return;
          }
          view.innerHTML =
            '<div class="space-y-4"><div class="skeleton h-28"></div><div class="skeleton h-48"></div></div>';
          setTimeout(function () {
            try {
              SP.pages[id](view);
            } catch (err) {
              console.error(err);
              view.innerHTML =
                '<div class="card p-8 text-sm text-red-700">Error rendering portal page: ' +
                esc(err.message) +
                "</div>";
            }
            lucide.createIcons();
          }, 150);
        },
        myLoans() {
          return DB.get("loans").filter((l) => l.patronId === SP.patron.id);
        },
        activeLoans() {
          return SP.myLoans().filter((l) => loanStatus(l) !== "returned");
        },
        cfg() {
          return Store.get("portalCfg", SEED.portalCfg);
        },
        reload() {
          SP.route();
        },
        pages: {},
      };

      window.SP_reserveForSelf = function (bookId, closePrev) {
        if (closePrev) closePrev();
        const cfg = SP.cfg();
        if (!cfg.allowReservations) {
          UI.toast("Online reservations are currently disabled", "error");
          return;
        }
        const b = bookById(bookId);
        if (SP.activeLoans().some((l) => l.bookId === bookId)) {
          UI.toast("You already have this title on loan", "error");
          return;
        }
        const dup = DB.get("reservations").find(
          (r) =>
            r.bookId === bookId &&
            r.patronId === SP.patron.id &&
            ["pending", "approved", "ready"].includes(r.status),
        );
        if (dup) {
          UI.toast(
            "You already have an active reservation for this title",
            "error",
          );
          return;
        }
        UI.confirm({
          title: "Reserve this book",
          message:
            "Place a hold on <strong>" +
            esc(trunc(b.title, 50)) +
            "</strong>? You will be notified here when a copy is ready for pickup at the " +
            deptName(b.dept) +
            " counter.",
          danger: false,
          confirmText: "Reserve",
          onConfirm: function () {
            DB.add("reservations", {
              id: uid("RSV"),
              bookId: bookId,
              patronId: SP.patron.id,
              dept: b.dept,
              date: todayStr(),
              status: b.available > 0 ? "approved" : "pending",
              note: "Placed via Student Portal",
            });
            logActivity(
              "Student reservation via portal: " + trunc(b.title, 40),
              "reservation",
            );
            UI.toast(
              b.available > 0
                ? "Reservation approved — please pick up within " +
                    settings().holdDays +
                    " days"
                : "Reservation added to the queue",
              "success",
            );
            SP.reload();
          },
        });
      };

      SP.pages.dashboard = function (el) {
        const act = SP.activeLoans();
        const cfg = SP.cfg();
        const dueSoon = act.filter(
          (l) =>
            daysLate(l.due) === 0 &&
            (new Date(l.due) - new Date(todayStr())) / 86400000 <= 3,
        );
        const overdue = act.filter((l) => loanStatus(l) === "overdue");
        const ready = DB.get("reservations").filter(
          (r) => r.patronId === SP.patron.id && r.status === "ready",
        );
        const outstanding = patronOutstanding(SP.patron.id);
        const notes = SP.notifications().filter((n) => !n.read);
        const newBooks = DB.get("books")
          .filter((b) => b.dept === SP.patron.dept)
          .slice()
          .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
          .slice(0, 5);
        el.innerHTML =
          '<div class="sp-hero p-6 md:p-8 mb-6"><div class="hero-pattern"></div><div class="relative z-10 flex flex-col md:flex-row md:items-center gap-4">' +
          '<div class="flex-1"><div class="text-gold-light text-xs uppercase tracking-[0.2em] font-semibold mb-1">Saint Anthony Library</div>' +
          '<h1 class="font-serif text-2xl md:text-4xl font-bold">Magandang araw, ' +
          esc(
            SP.patron.name.split(" ").slice(-2)[0] ||
              SP.patron.name.split(" ")[0],
          ) +
          "!</h1>" +
          '<p class="text-warm/80 text-sm mt-2 max-w-lg">' +
          esc(cfg.announcement || "") +
          "</p></div>" +
          '<div class="flex gap-2"><a href="#/catalog" class="btn btn-gold"><i data-lucide="search" class="w-4 h-4"></i> Search catalog</a></div>' +
          "</div></div>" +
          '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">' +
          UI.statCard({
            label: "Currently borrowed",
            value: act.length,
            icon: "book-open",
            tone: "maroon",
            sub: "limit " + cfg.maxBooks + " books",
          }) +
          UI.statCard({
            label: "Due soon / overdue",
            value: dueSoon.length + overdue.length,
            icon: "alarm-clock",
            tone: overdue.length ? "red" : "amber",
            sub: overdue.length ? overdue.length + " overdue" : "within 3 days",
          }) +
          UI.statCard({
            label: "Ready for pickup",
            value: ready.length,
            icon: "package",
            tone: "green",
            sub: "at the hold shelf",
          }) +
          UI.statCard({
            label: "Fines due",
            value: cfg.showFines ? money(outstanding) : "Hidden",
            icon: "banknote",
            tone: outstanding > 0 ? "red" : "green",
          }) +
          "</div>" +
          (overdue.length
            ? '<div class="card p-4 mb-6 !border-red-200 bg-red-50/60 flex items-start gap-3"><i data-lucide="alert-triangle" class="w-5 h-5 text-red-700 mt-0.5"></i><div class="text-sm text-red-900"><strong>You have overdue books.</strong> Please return them to the ' +
              deptName(SP.patron.dept) +
              " counter. Fines accrue at " +
              money(settings().finePerDay) +
              ' per day and will block new borrowing. <a class="font-semibold underline cursor-pointer" href="#/loans">View loans →</a></div></div>'
            : "") +
          '<div class="grid lg:grid-cols-3 gap-5">' +
          '<div class="lg:col-span-2 space-y-5">' +
          '<div class="card"><div class="p-4 border-b border-ink/8 flex justify-between items-center"><h3 class="font-serif font-bold">My current loans</h3><a class="text-xs text-maroon font-semibold" href="#/loans">View all →</a></div>' +
          (act.length
            ? '<div class="overflow-x-auto"><table class="tbl w-full"><thead><tr><th>Book</th><th>Due date</th><th>Status</th><th></th></tr></thead><tbody>' +
              act
                .map(function (l) {
                  const st = loanStatus(l);
                  const dleft = Math.ceil(
                    (new Date(l.due) - new Date(todayStr())) / 86400000,
                  );
                  return (
                    '<tr><td><div class="font-semibold text-sm">' +
                    esc(trunc(bookTitle(l.bookId), 40)) +
                    '</div><div class="text-[11px] text-muted">' +
                    (bookById(l.bookId) || {}).callNo +
                    "</div></td>" +
                    "<td>" +
                    fmtDate(l.due) +
                    '<div class="text-[11px] ' +
                    (dleft < 0 ? "text-red-700" : "text-muted") +
                    '">' +
                    (dleft < 0
                      ? -dleft + " days late"
                      : dleft === 0
                        ? "due today"
                        : dleft + " days left") +
                    "</div></td>" +
                    "<td>" +
                    UI.statusBadge(st) +
                    "</td>" +
                    '<td class="text-right"><button class="btn btn-sm btn-outline" data-renew="' +
                    l.id +
                    '"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Renew</button></td></tr>'
                  );
                })
                .join("") +
              "</tbody></table></div>"
            : '<div class="empty"><i data-lucide="book-open"></i><p class="text-sm">You have no books on loan right now.</p><a class="btn btn-primary btn-sm mt-3" href="#/catalog">Browse the catalog</a></div>') +
          "</div>" +
          '<div class="card p-4"><h3 class="font-serif font-bold mb-3">New arrivals in your library</h3><div class="flex gap-3 overflow-x-auto pb-2">' +
          newBooks
            .map(
              (b) =>
                '<button class="flex-shrink-0 text-left w-32" data-bk="' +
                b.id +
                '">' +
                UI.bookCover(b, "md") +
                '<div class="text-[11px] font-semibold mt-1.5 leading-tight line-clamp-2">' +
                esc(trunc(b.title, 44)) +
                '</div><div class="text-[10px] text-muted">' +
                esc(trunc(b.author, 22)) +
                "</div></button>",
            )
            .join("") +
          "</div></div>" +
          "</div>" +
          '<div class="space-y-5">' +
          '<div class="card p-4"><div class="flex justify-between items-center mb-3"><h3 class="font-serif font-bold">Notifications</h3><a class="text-xs text-maroon font-semibold" href="#/notifications">All →</a></div>' +
          (notes.length
            ? notes
                .slice(0, 4)
                .map(
                  (n) =>
                    '<div class="flex gap-2.5 py-2 border-b border-ink/5 last:border-0"><span class="w-2 h-2 rounded-full bg-gold mt-1.5 flex-shrink-0"></span><div><div class="text-[13px] font-semibold leading-snug">' +
                    esc(n.title) +
                    '</div><div class="text-[11px] text-muted">' +
                    fmtDate(n.date) +
                    "</div></div></div>",
                )
                .join("")
            : '<p class="text-sm text-muted py-3">No unread notifications 🎉</p>') +
          "</div>" +
          '<div class="card p-4"><h3 class="font-serif font-bold mb-3">My borrowing this term</h3><div class="h-40"><canvas id="sp-chart"></canvas></div></div>' +
          '<div class="card p-4 bg-warm"><h3 class="font-serif font-bold mb-2 text-sm">Library hours today</h3>' +
          (function () {
            const h =
              DB.get("hours").find((x) => x.dept === SP.patron.dept) ||
              DB.get("hours")[0];
            const dow = new Date().getDay();
            const v =
              dow === 0 ? h.sunday : dow === 6 ? h.saturday : h.weekdays;
            return (
              '<p class="text-sm">' +
              esc(deptName(SP.patron.dept)) +
              " — <strong>" +
              esc(v) +
              "</strong></p>"
            );
          })() +
          '<a class="text-xs text-maroon font-semibold mt-2 inline-block" href="#/services">Full schedule & rules →</a></div>' +
          "</div>" +
          "</div>";
        lucide.createIcons();
        el.querySelectorAll("[data-bk]").forEach(
          (b) =>
            (b.onclick = function () {
              openBookModal(this.dataset.bk, { studentMode: true });
            }),
        );
        el.querySelectorAll("[data-renew]").forEach(
          (b) =>
            (b.onclick = function () {
              SP.renew(this.dataset.renew);
            }),
        );
        const months = [];
        const cnts = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const key = d.toISOString().slice(0, 7);
          months.push(d.toLocaleDateString("en-PH", { month: "short" }));
          cnts.push(
            SP.myLoans().filter((l) => l.checkout && l.checkout.startsWith(key))
              .length,
          );
        }
        UI.chart("sp-chart", {
          type: "bar",
          data: {
            labels: months,
            datasets: [
              {
                label: "Books borrowed",
                data: cnts,
                backgroundColor: "#7D1519",
                borderRadius: 5,
                maxBarThickness: 24,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { stepSize: 1 },
                grid: { color: "#F1ECE3" },
              },
              x: { grid: { display: false } },
            },
          },
        });
      };
      SP.renew = function (loanId) {
        const l = DB.get("loans").find((x) => x.id === loanId);
        if (!l || l.patronId !== SP.patron.id) return;
        const S = settings();
        const cfg = SP.cfg();
        if (!cfg.allowRenewals) {
          UI.toast(
            "Online renewals are currently disabled by the library",
            "error",
          );
          return;
        }
        if (loanStatus(l) === "overdue") {
          UI.toast(
            "Overdue books cannot be renewed. Return the book and settle any fine first.",
            "error",
          );
          return;
        }
        if (l.renewals >= S.maxRenewals) {
          UI.toast(
            "You have renewed this book " +
              l.renewals +
              " time(s) — the maximum is " +
              S.maxRenewals +
              ".",
            "error",
          );
          return;
        }
        if (
          DB.get("reservations").some(
            (r) =>
              r.bookId === l.bookId &&
              ["pending", "approved", "ready"].includes(r.status) &&
              r.patronId !== SP.patron.id,
          )
        ) {
          UI.toast(
            "Another patron has reserved this title — renewal not allowed",
            "error",
          );
          return;
        }
        const days =
          SP.patron.type === "student" ? S.loanDaysStudent : S.loanDaysFaculty;
        DB.update("loans", loanId, {
          due: dateAdd(l.due, days),
          renewals: l.renewals + 1,
        });
        logActivity(
          "Renewed via Student Portal: " + trunc(bookTitle(l.bookId), 36),
          "return",
        );
        UI.toast(
          "Renewed! New due date: " + fmtDate(dateAdd(l.due, days)),
          "success",
        );
        SP.reload();
      };

      SP.pages.catalog = function (el) {
        const st = { q: "", avail: "" };
        el.innerHTML =
          '<h1 class="font-serif text-2xl font-bold mb-1">Library Catalog</h1><p class="text-sm text-muted mb-5">Search books available in the ' +
          deptName(SP.patron.dept) +
          " and across the university.</p>" +
          '<div class="card p-4 mb-5 flex flex-col md:flex-row gap-3">' +
          '<div class="relative flex-1"><i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted"></i><input id="sp-q" class="input w-full !pl-9" placeholder="Search by title, author, subject or ISBN…"></div>' +
          '<select id="sp-avail" class="input md:w-48"><option value="">Any availability</option><option value="yes">Available now</option></select>' +
          '</div><div id="sp-results" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"></div><div id="sp-more" class="text-center mt-5"></div>';
        lucide.createIcons();
        let limit = 15;
        function render() {
          let rows = DB.get("books");
          if (st.q) {
            const q = st.q.toLowerCase();
            rows = rows.filter((b) =>
              (
                b.title +
                " " +
                b.author +
                " " +
                b.subject +
                " " +
                b.isbn +
                " " +
                b.callNo
              )
                .toLowerCase()
                .includes(q),
            );
          }
          if (st.avail === "yes") rows = rows.filter((b) => b.available > 0);
          rows.sort(
            (a, b) =>
              (b.dept === SP.patron.dept) - (a.dept === SP.patron.dept) ||
              b.popularity - a.popularity,
          );
          const shown = rows.slice(0, limit);
          document.getElementById("sp-results").innerHTML = shown.length
            ? shown
                .map(
                  (b) =>
                    '<button class="card p-3 text-left hover:shadow-md hover:-translate-y-0.5 transition" data-bk="' +
                    b.id +
                    '">' +
                    '<div class="flex justify-center mb-2">' +
                    UI.bookCover(b, "md") +
                    "</div>" +
                    '<div class="text-[12.5px] font-semibold leading-snug line-clamp-2 min-h-[2.1em]">' +
                    esc(trunc(b.title, 48)) +
                    "</div>" +
                    '<div class="text-[11px] text-muted truncate mt-0.5">' +
                    esc(trunc(b.author, 26)) +
                    "</div>" +
                    '<div class="mt-2">' +
                    (b.available > 0
                      ? '<span class="badge badge-green">' +
                        b.available +
                        " available</span>"
                      : '<span class="badge badge-amber">All on loan — reserve</span>') +
                    "</div></button>",
                )
                .join("")
            : '<div class="col-span-full card">' +
              UI.empty("No books match your search", "search-x") +
              "</div>";
          document.getElementById("sp-more").innerHTML =
            rows.length > limit
              ? '<button class="btn btn-outline" id="sp-morebtn">Show more (' +
                (rows.length - limit) +
                " remaining)</button>"
              : '<p class="text-xs text-muted">' +
                rows.length +
                " record(s)</p>";
          const mb = document.getElementById("sp-morebtn");
          if (mb)
            mb.onclick = function () {
              limit += 15;
              render();
              lucide.createIcons();
            };
          document.querySelectorAll("#sp-results [data-bk]").forEach(
            (b) =>
              (b.onclick = function () {
                openBookModal(this.dataset.bk, { studentMode: true });
              }),
          );
          lucide.createIcons();
        }
        document.getElementById("sp-q").addEventListener("input", function () {
          st.q = this.value;
          limit = 15;
          render();
        });
        document
          .getElementById("sp-avail")
          .addEventListener("change", function () {
            st.avail = this.value;
            render();
          });
        render();
      };

      SP.pages.loans = function (el) {
        const loans = SP.myLoans();
        el.innerHTML =
          '<h1 class="font-serif text-2xl font-bold mb-1">My Loans</h1><p class="text-sm text-muted mb-5">Books you have borrowed, due dates, renewals and full history.</p>' +
          '<div class="tabs mb-5" id="sp-loan-tabs"><button class="tab-btn active" data-t="cur">Current (' +
          loans.filter((l) => loanStatus(l) !== "returned").length +
          ')</button><button class="tab-btn" data-t="hist">History (' +
          loans.filter((l) => l.returned).length +
          ')</button></div><div id="sp-loan-body"></div>';
        lucide.createIcons();
        function cur() {
          const rows = loans.filter((l) => loanStatus(l) !== "returned");
          document.getElementById("sp-loan-body").innerHTML = rows.length
            ? '<div class="card"><div id="sp-loans-tbl"></div></div>'
            : '<div class="card">' +
              UI.empty("No books currently on loan", "book-open") +
              '<div class="text-center pb-4"><a class="btn btn-primary btn-sm" href="#/catalog">Find a book to borrow</a></div></div>';
          if (!rows.length) {
            lucide.createIcons();
            return;
          }
          UI.renderTable("#sp-loans-tbl", {
            columns: [
              {
                key: "bookId",
                label: "Book",
                render: (l) =>
                  '<div class="font-semibold">' +
                  esc(trunc(bookTitle(l.bookId), 44)) +
                  '</div><div class="text-[11px] text-muted">' +
                  esc((bookById(l.bookId) || {}).author || "") +
                  "</div>",
              },
              {
                key: "checkout",
                label: "Borrowed",
                render: (l) => fmtDate(l.checkout),
              },
              {
                key: "due",
                label: "Due date",
                render: (l) => {
                  const d = Math.ceil(
                    (new Date(l.due) - new Date(todayStr())) / 86400000,
                  );
                  return (
                    fmtDate(l.due) +
                    '<div class="text-[11px] ' +
                    (d < 0 ? "text-red-700 font-semibold" : "text-muted") +
                    '">' +
                    (d < 0
                      ? -d + " days overdue"
                      : d === 0
                        ? "due today"
                        : d + " days left") +
                    "</div>"
                  );
                },
              },
              {
                key: "renewals",
                label: "Renewals",
                render: (l) => "×" + l.renewals,
              },
              {
                key: "status",
                label: "Status",
                render: (l) => UI.statusBadge(loanStatus(l)),
              },
            ],
            rows: rows,
            deptScope: false,
            search: false,
            pageSize: 10,
            actions: [
              {
                icon: "refresh-cw",
                label: "Renew",
                show: (l) => loanStatus(l) !== "overdue",
                onClick: (l) => SP.renew(l.id),
              },
            ],
          });
        }
        function hist() {
          const rows = loans.filter((l) => l.returned);
          document.getElementById("sp-loan-body").innerHTML =
            '<div class="card"><div id="sp-hist-tbl"></div></div>';
          UI.renderTable("#sp-hist-tbl", {
            columns: [
              {
                key: "bookId",
                label: "Book",
                render: (l) => esc(trunc(bookTitle(l.bookId), 44)),
              },
              {
                key: "checkout",
                label: "Borrowed",
                render: (l) => fmtDate(l.checkout),
              },
              {
                key: "returned",
                label: "Returned",
                render: (l) => fmtDate(l.returned),
              },
              {
                key: "fine",
                label: "Fine",
                render: (l) => {
                  const f = l.fineAssessed || 0;
                  return f > 0
                    ? money(f) +
                        " " +
                        (paidFor(l.id) >= f
                          ? UI.badge("paid", "green")
                          : UI.badge("due", "red"))
                    : '<span class="text-muted">—</span>';
                },
              },
            ],
            rows: rows,
            deptScope: false,
            search: false,
            pageSize: 10,
            emptyText: "No borrowing history yet",
          });
        }
        cur();
        document
          .querySelectorAll("#sp-loan-tabs .tab-btn")
          .forEach(function (b) {
            b.onclick = function () {
              document
                .querySelectorAll("#sp-loan-tabs .tab-btn")
                .forEach((x) => x.classList.remove("active"));
              b.classList.add("active");
              b.dataset.t === "cur" ? cur() : hist();
            };
          });
      };

      SP.pages.reservations = function (el) {
        const rs = DB.get("reservations").filter(
          (r) => r.patronId === SP.patron.id,
        );
        el.innerHTML =
          '<h1 class="font-serif text-2xl font-bold mb-1">My Reservations</h1><p class="text-sm text-muted mb-5">Track holds you have placed. Ready items are kept at the hold shelf for ' +
          settings().holdDays +
          " days.</p>" +
          (rs.length
            ? '<div class="card"><div id="sp-rsv-tbl"></div></div>'
            : '<div class="card">' +
              UI.empty("You have no reservations", "bookmark") +
              '<div class="text-center pb-4"><a class="btn btn-primary btn-sm" href="#/catalog">Search the catalog</a></div></div>');
        lucide.createIcons();
        if (!rs.length) return;
        UI.renderTable("#sp-rsv-tbl", {
          columns: [
            {
              key: "bookId",
              label: "Book",
              render: (r) =>
                '<div class="font-semibold">' +
                esc(trunc(bookTitle(r.bookId), 44)) +
                '</div><div class="text-[11px] text-muted">' +
                deptName(r.dept) +
                "</div>",
            },
            { key: "date", label: "Placed", render: (r) => fmtDate(r.date) },
            {
              key: "status",
              label: "Status",
              render: (r) =>
                UI.statusBadge(r.status) +
                (r.note
                  ? '<div class="text-[11px] text-muted mt-0.5">' +
                    esc(r.note) +
                    "</div>"
                  : ""),
            },
            {
              key: "pickup",
              label: "Pickup",
              render: (r) =>
                r.status === "ready"
                  ? '<span class="badge badge-green">Collect within ' +
                    settings().holdDays +
                    " days</span>"
                  : '<span class="text-muted text-xs">—</span>',
            },
          ],
          rows: rs,
          deptScope: false,
          search: false,
          pageSize: 10,
          actions: [
            {
              icon: "x",
              label: "Cancel reservation",
              danger: true,
              show: (r) => ["pending", "approved"].includes(r.status),
              onClick: (r) =>
                UI.confirm({
                  title: "Cancel reservation",
                  message:
                    "Cancel your hold on <strong>" +
                    esc(trunc(bookTitle(r.bookId), 44)) +
                    "</strong>?",
                  confirmText: "Cancel hold",
                  onConfirm: function () {
                    DB.update("reservations", r.id, {
                      status: "cancelled",
                      note: "Cancelled by patron via portal",
                    });
                    UI.toast("Reservation cancelled", "info");
                    SP.reload();
                  },
                }),
            },
          ],
        });
      };

      SP.pages.fines = function (el) {
        const cfg = SP.cfg();
        const S = settings();
        let rows = [];
        SP.myLoans().forEach(function (l) {
          const late = daysLate(l.due, l.returned || todayStr());
          if (late <= 0) return;
          const amount =
            l.returned && l.fineAssessed ? l.fineAssessed : late * S.finePerDay;
          rows.push({
            ref: l.id,
            type: "Overdue fine",
            book: trunc(bookTitle(l.bookId), 40),
            detail: l.returned
              ? "Returned " + late + " day(s) late"
              : "Overdue since " + fmtDate(l.due),
            amount: amount,
          });
        });
        DB.get("fines")
          .filter((f) => f.patronId === SP.patron.id)
          .forEach(function (f) {
            rows.push({
              ref: f.id,
              type:
                f.type === "lost" ? "Lost book charge" : "Damaged book charge",
              book: trunc(bookTitle(f.bookId), 40),
              detail: f.note,
              amount: f.amount,
            });
          });
        rows.forEach(function (r) {
          r.paid = paidFor(r.ref);
          r.balance = Math.max(0, r.amount - r.paid);
          r.status =
            r.balance <= 0 ? "paid" : r.paid > 0 ? "partial" : "outstanding";
        });
        const totalDue = rows.reduce((s, r) => s + r.balance, 0);
        el.innerHTML =
          '<h1 class="font-serif text-2xl font-bold mb-1">My Fines</h1><p class="text-sm text-muted mb-5">Overdue, lost and damaged book charges. Payments here are <strong>simulated</strong> — settle real fines at the circulation counter.</p>' +
          '<div class="card p-5 mb-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 ' +
          (totalDue > 0
            ? "!border-red-200 bg-red-50/50"
            : "bg-green-50/50 !border-green-200") +
          '">' +
          '<span class="stat-ic !w-12 !h-12" style="background:' +
          (totalDue > 0 ? "#FDECEA" : "#E7F6EC") +
          ";color:" +
          (totalDue > 0 ? "#B42318" : "#157F3D") +
          '"><i data-lucide="' +
          (totalDue > 0 ? "alert-circle" : "check-circle-2") +
          '" class="w-6 h-6"></i></span>' +
          '<div class="flex-1"><div class="text-xs uppercase tracking-wider text-muted font-semibold">Outstanding balance</div><div class="font-serif text-3xl font-bold ' +
          (totalDue > 0 ? "text-red-700" : "text-green-700") +
          '">' +
          money(totalDue) +
          "</div></div>" +
          (totalDue > 0 && cfg.showFines
            ? '<button class="btn btn-primary" id="sp-payall"><i data-lucide="banknote" class="w-4 h-4"></i> Pay now (simulated)</button>'
            : "") +
          "</div>" +
          '<div class="card"><div id="sp-fine-tbl"></div></div>' +
          '<div class="card mt-5"><div class="p-4 border-b border-ink/8"><h3 class="font-serif font-bold">My payment history</h3></div><div id="sp-pay-tbl"></div></div>';
        lucide.createIcons();
        const payAll = document.getElementById("sp-payall");
        if (payAll)
          payAll.onclick = function () {
            UI.confirm({
              title: "Pay outstanding fines",
              message:
                "Simulate payment of <strong>" +
                money(totalDue) +
                "</strong> via the portal? No real money is processed in this prototype.",
              danger: false,
              confirmText: "Pay " + money(totalDue),
              onConfirm: function () {
                rows
                  .filter((r) => r.balance > 0)
                  .forEach(function (r) {
                    DB.add("payments", {
                      id: uid("PAY"),
                      ref: r.ref,
                      amount: r.balance,
                      date: todayStr(),
                      method: "Simulated Online Payment",
                      or: "SIM-" + Date.now().toString().slice(-6),
                      cashier: "Student Portal",
                    });
                  });
                logActivity(
                  "Student paid " +
                    money(totalDue) +
                    " in fines via portal (simulated)",
                  "payment",
                );
                UI.toast(
                  "Payment successful (simulated) — receipt available at the counter",
                  "success",
                );
                SP.reload();
              },
            });
          };
        UI.renderTable("#sp-fine-tbl", {
          columns: [
            { key: "ref", label: "Reference" },
            {
              key: "type",
              label: "Charge",
              render: (r) =>
                UI.badge(
                  r.type,
                  r.type.startsWith("Overdue") ? "amber" : "red",
                ),
            },
            { key: "book", label: "Book" },
            {
              key: "detail",
              label: "Detail",
              render: (r) =>
                '<span class="text-xs text-muted">' + esc(r.detail) + "</span>",
              cls: "hidden md:table-cell",
            },
            { key: "amount", label: "Amount", render: (r) => money(r.amount) },
            {
              key: "status",
              label: "Status",
              render: (r) => UI.statusBadge(r.status),
            },
          ],
          rows: rows,
          deptScope: false,
          search: false,
          pageSize: 8,
          emptyText: "No fines — keep it up!",
        });
        UI.renderTable("#sp-pay-tbl", {
          columns: [
            {
              key: "or",
              label: "OR / Ref",
              render: (p) => '<span class="chip-code">' + esc(p.or) + "</span>",
            },
            { key: "ref", label: "For charge" },
            {
              key: "amount",
              label: "Amount",
              render: (p) =>
                '<span class="font-semibold text-green-700">' +
                money(p.amount) +
                "</span>",
            },
            { key: "method", label: "Method" },
            { key: "date", label: "Date", render: (p) => fmtDate(p.date) },
          ],
          rows: () =>
            DB.get("payments").filter((p) => {
              const l = DB.get("loans").find((x) => x.id === p.ref);
              const f = DB.get("fines").find((x) => x.id === p.ref);
              return (
                (l && l.patronId === SP.patron.id) ||
                (f && f.patronId === SP.patron.id)
              );
            }),
          deptScope: false,
          search: false,
          pageSize: 6,
          emptyText: "No payments recorded yet",
        });
      };

      SP.pages.notifications = function (el) {
        const notes = SP.notifications();
        el.innerHTML =
          '<div class="flex flex-wrap justify-between items-center gap-3 mb-5"><div><h1 class="font-serif text-2xl font-bold">Notifications</h1><p class="text-sm text-muted mt-1">Announcements, due-date reminders and reservation updates.</p></div><button class="btn btn-outline btn-sm" id="sp-markall"><i data-lucide="check-check" class="w-4 h-4"></i> Mark all read</button></div>' +
          '<div class="space-y-3" id="sp-notes"></div>';
        lucide.createIcons();
        function render() {
          const list = SP.notifications();
          document.getElementById("sp-notes").innerHTML = list.length
            ? list
                .map(function (n) {
                  const ic =
                    {
                      overdue: "alert-triangle",
                      reservation: "bookmark",
                      due: "clock",
                      announcement: "megaphone",
                      system: "settings-2",
                    }[n.type] || "bell";
                  return (
                    '<div class="card p-4 flex gap-3.5 ' +
                    (n.read ? "opacity-70" : "border-l-4 !border-l-gold") +
                    '">' +
                    '<span class="stat-ic !w-9 !h-9 !rounded-lg flex-shrink-0" style="background:#F6E7E7;color:#7D1519"><i data-lucide="' +
                    ic +
                    '" class="w-4 h-4"></i></span>' +
                    '<div class="flex-1 min-w-0"><div class="flex justify-between gap-2"><div class="font-semibold text-sm">' +
                    esc(n.title) +
                    '</div><span class="text-[11px] text-muted whitespace-nowrap">' +
                    fmtDate(n.date) +
                    "</span></div>" +
                    '<p class="text-[13px] text-muted mt-1 leading-relaxed">' +
                    esc(n.body) +
                    "</p>" +
                    (!n.read
                      ? '<button class="text-xs text-maroon font-semibold mt-2" data-read="' +
                        n.id +
                        '">Mark as read</button>'
                      : "") +
                    "</div></div>"
                  );
                })
                .join("")
            : '<div class="card">' +
              UI.empty("No notifications", "bell-off") +
              "</div>";
          lucide.createIcons();
          document.querySelectorAll("[data-read]").forEach(function (b) {
            b.onclick = function () {
              const a = DB.get("notifications");
              const n = a.find((x) => x.id === b.dataset.read);
              if (n) n.read = true;
              DB.set("notifications", a);
              SP.updateBell();
              render();
            };
          });
        }
        document.getElementById("sp-markall").onclick = function () {
          const a = DB.get("notifications");
          a.forEach((n) => (n.read = true));
          DB.set("notifications", a);
          SP.updateBell();
          render();
          UI.toast("All notifications marked as read", "success");
        };
        render();
      };

      SP.pages.services = function (el) {
        const h =
          DB.get("hours").find((x) => x.dept === SP.patron.dept) ||
          DB.get("hours")[0];
        el.innerHTML =
          '<h1 class="font-serif text-2xl font-bold mb-1">Library Information & Services</h1><p class="text-sm text-muted mb-5">Everything you need to know about using the ' +
          deptName(SP.patron.dept) +
          ".</p>" +
          '<div class="grid lg:grid-cols-3 gap-5">' +
          '<div class="lg:col-span-2 space-y-5">' +
          '<div class="card p-5"><h3 class="font-serif font-bold mb-3">Operating hours — all libraries</h3><div class="overflow-x-auto"><table class="tbl w-full"><thead><tr><th>Library</th><th>Mon–Fri</th><th>Saturday</th><th>Sunday</th></tr></thead><tbody>' +
          DB.get("hours")
            .map(
              (x) =>
                '<tr class="' +
                (x.dept === SP.patron.dept ? "bg-warm" : "") +
                '"><td>' +
                UI.deptBadge(x.dept) +
                '</td><td class="font-medium">' +
                esc(x.weekdays) +
                "</td><td>" +
                esc(x.saturday) +
                "</td><td>" +
                esc(x.sunday) +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table></div></div>" +
          '<div class="card p-5"><h3 class="font-serif font-bold mb-3">Borrowing policy quick reference</h3><div class="grid sm:grid-cols-3 gap-3 text-center">' +
          '<div class="bg-warm rounded-lg p-4"><div class="font-serif text-2xl font-bold text-maroon">' +
          settings().maxBooksStudent +
          '</div><div class="text-xs text-muted mt-1">books at a time (students)</div></div>' +
          '<div class="bg-warm rounded-lg p-4"><div class="font-serif text-2xl font-bold text-maroon">' +
          settings().loanDaysStudent +
          ' days</div><div class="text-xs text-muted mt-1">loan period · renew ×' +
          settings().maxRenewals +
          "</div></div>" +
          '<div class="bg-warm rounded-lg p-4"><div class="font-serif text-2xl font-bold text-maroon">' +
          money(settings().finePerDay) +
          '/day</div><div class="text-xs text-muted mt-1">overdue fine (simulated)</div></div>' +
          "</div></div>" +
          '<div class="card p-5"><h3 class="font-serif font-bold mb-3">Library rules</h3><ul class="space-y-2 text-sm text-ink/85">' +
          [
            "Present your USANT ID at every transaction.",
            "Return books on or before the due date.",
            "Keep silence in reading areas.",
            "No food; covered drinks only.",
            "Report lost or damaged books immediately.",
            "Reservations are held for " +
              settings().holdDays +
              " days once “ready”.",
          ]
            .map(
              (r) =>
                '<li class="flex gap-2"><i data-lucide="check" class="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0"></i>' +
                r +
                "</li>",
            )
            .join("") +
          "</ul></div>" +
          '<div class="card p-5"><h3 class="font-serif font-bold mb-3">Announcements</h3><div class="space-y-3">' +
          DB.get("announcements")
            .filter(
              (a) => a.audience === "all" || a.audience === SP.patron.dept,
            )
            .map(
              (a) =>
                '<div class="border border-ink/8 rounded-lg p-3.5"><div class="flex justify-between"><span class="font-semibold text-sm">' +
                esc(a.title) +
                '</span><span class="text-[11px] text-muted">' +
                fmtDate(a.date) +
                '</span></div><p class="text-xs text-muted mt-1">' +
                esc(a.body) +
                "</p></div>",
            )
            .join("") +
          "</div></div>" +
          "</div>" +
          '<div class="space-y-5">' +
          '<div class="card p-5"><h3 class="font-serif font-bold mb-3">Contact the library</h3><div class="space-y-2.5 text-sm">' +
          '<div class="flex gap-2.5"><i data-lucide="map-pin" class="w-4 h-4 text-maroon mt-0.5"></i><span>USANT Main Library, Iriga City</span></div>' +
          '<div class="flex gap-2.5"><i data-lucide="phone" class="w-4 h-4 text-maroon mt-0.5"></i><span>(054) 223-0912 ext. 116 <em class="text-xs text-muted">(sample)</em></span></div>' +
          '<div class="flex gap-2.5"><i data-lucide="mail" class="w-4 h-4 text-maroon mt-0.5"></i><span>library@usant.edu.ph</span></div></div></div>' +
          '<div class="card p-5"><h3 class="font-serif font-bold mb-3">FAQ</h3><div class="space-y-2">' +
          DB.get("faq")
            .map(
              (f) =>
                '<details class="border border-ink/8 rounded-lg px-3 py-2 group"><summary class="text-[13px] font-semibold cursor-pointer list-none flex justify-between gap-2">' +
                esc(f.q) +
                '<i data-lucide="chevron-down" class="w-4 h-4 text-muted flex-shrink-0 transition group-open:rotate-180"></i></summary><p class="text-xs text-muted mt-2 leading-relaxed">' +
                esc(f.a) +
                "</p></details>",
            )
            .join("") +
          "</div></div>" +
          "</div>" +
          "</div>";
        lucide.createIcons();
      };

      SP.pages.profile = function (el) {
        const p = SP.patron;
        el.innerHTML =
          '<h1 class="font-serif text-2xl font-bold mb-1">My Profile</h1><p class="text-sm text-muted mb-5">Your library membership details and account security (simulated).</p>' +
          '<div class="grid lg:grid-cols-3 gap-5">' +
          '<div class="card p-6 text-center"><span class="avatar avatar-lg mx-auto !w-20 !h-20 !text-2xl">' +
          initials(p.name) +
          "</span>" +
          '<h3 class="font-serif text-lg font-bold mt-3">' +
          esc(p.name) +
          '</h3><div class="text-sm text-muted">' +
          esc(p.program) +
          " · " +
          esc(p.year) +
          "</div>" +
          '<div class="flex justify-center gap-1.5 mt-2">' +
          UI.badge(p.type, "maroon") +
          UI.statusBadge(p.status) +
          UI.deptBadge(p.dept) +
          "</div>" +
          '<div class="mt-5 pt-4 border-t border-ink/8 grid grid-cols-3 text-center">' +
          '<div><div class="font-serif text-xl font-bold">' +
          SP.myLoans().length +
          '</div><div class="text-[10px] uppercase text-muted">Lifetime loans</div></div>' +
          '<div><div class="font-serif text-xl font-bold">' +
          SP.activeLoans().length +
          '</div><div class="text-[10px] uppercase text-muted">On loan now</div></div>' +
          '<div><div class="font-serif text-xl font-bold">' +
          money(patronOutstanding(p.id)) +
          '</div><div class="text-[10px] uppercase text-muted">Fines due</div></div>' +
          "</div></div>" +
          '<div class="lg:col-span-2 space-y-5">' +
          '<div class="card p-5"><h3 class="font-serif font-bold mb-4">Personal information</h3><div class="grid md:grid-cols-2 gap-4" id="pf-form">' +
          '<div><label class="label">Full name</label><input id="pf-name" class="input w-full" value="' +
          esc(p.name) +
          '"></div>' +
          '<div><label class="label">Student number</label><input class="input w-full" value="' +
          esc(p.no) +
          '" disabled></div>' +
          '<div><label class="label">Email</label><input id="pf-email" class="input w-full" type="email" value="' +
          esc(p.email) +
          '"></div>' +
          '<div><label class="label">Phone</label><input id="pf-phone" class="input w-full" value="' +
          esc(p.phone) +
          '"></div>' +
          '<div class="md:col-span-2"><button class="btn btn-primary" id="pf-save"><i data-lucide="save" class="w-4 h-4"></i> Save changes</button></div>' +
          "</div></div>" +
          '<div class="card p-5"><h3 class="font-serif font-bold mb-4">Change password (simulated)</h3><div class="grid md:grid-cols-3 gap-4">' +
          '<div><label class="label">Current password</label><input id="pf-pw0" type="password" class="input w-full" placeholder="••••••••"></div>' +
          '<div><label class="label">New password</label><input id="pf-pw1" type="password" class="input w-full" placeholder="min. 6 characters"></div>' +
          '<div><label class="label">Confirm new password</label><input id="pf-pw2" type="password" class="input w-full"></div>' +
          '<div class="md:col-span-3"><button class="btn btn-outline" id="pf-pw-save"><i data-lucide="key-round" class="w-4 h-4"></i> Update password</button></div>' +
          "</div></div>" +
          '<div class="card p-5 bg-warm"><h3 class="font-serif font-bold mb-2 text-sm flex items-center gap-2"><i data-lucide="shield-check" class="w-4 h-4 text-maroon"></i> Account status</h3>' +
          '<p class="text-xs text-muted leading-relaxed">Membership: <strong class="text-ink">' +
          esc(p.status) +
          "</strong> · Member since " +
          fmtDate(p.joined) +
          ". Portal access is " +
          (p.portalAccess === false ? "disabled" : "enabled") +
          ". Questions? Visit the " +
          deptName(p.dept) +
          " circulation counter.</p></div>" +
          "</div>" +
          "</div>";
        lucide.createIcons();
        document.getElementById("pf-save").onclick = function () {
          const name = document.getElementById("pf-name").value.trim();
          const email = document.getElementById("pf-email").value.trim();
          const phone = document.getElementById("pf-phone").value.trim();
          if (!name) {
            UI.toast("Name cannot be empty", "error");
            return;
          }
          if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            UI.toast("Enter a valid email address", "error");
            return;
          }
          DB.update("patrons", p.id, {
            name: name,
            email: email,
            phone: phone,
          });
          const u = Session.user();
          if (u && u.patronId === p.id)
            DB.update("users", u.id, {
              name: name,
              email: email,
              phone: phone,
            });
          SP.patron = DB.get("patrons").find((x) => x.id === p.id);
          SP.renderNav();
          UI.toast("Profile updated (simulated)", "success");
          SP.reload();
        };
        document.getElementById("pf-pw-save").onclick = function () {
          const a = document.getElementById("pf-pw0").value,
            b = document.getElementById("pf-pw1").value,
            c = document.getElementById("pf-pw2").value;
          if (!a || !b) {
            UI.toast("Fill in current and new password", "error");
            return;
          }
          if (b.length < 6) {
            UI.toast("New password must be at least 6 characters", "error");
            return;
          }
          if (b !== c) {
            UI.toast("New passwords do not match", "error");
            return;
          }
          const u = Session.user();
          if (u) DB.update("users", u.id, { password: b });
          UI.toast(
            "Password updated (simulated — nothing is really verified)",
            "success",
          );
          ["pf-pw0", "pf-pw1", "pf-pw2"].forEach(
            (id) => (document.getElementById(id).value = ""),
          );
        };
      };

      document.addEventListener("DOMContentLoaded", function () {
        Proto.boot();
      });
    