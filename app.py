"""Gym Tracker: rutinas, series (peso / reps / RIR) y progreso.

Hecho con Streamlit + SQLite (archivo gym.db en la misma carpeta).
"""
import sqlite3
from contextlib import contextmanager
from datetime import date
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

st.set_page_config(page_title="Gym Tracker", page_icon="🏋️", layout="centered")

DB_PATH = Path(__file__).parent / "gym.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS routine_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    target_sets INTEGER DEFAULT 3,
    position INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    routine_name TEXT NOT NULL,
    UNIQUE(date, routine_name)
);
CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    set_no INTEGER NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,
    rir INTEGER
);
"""


# ----------------------------------------------------------------- base de datos
@contextmanager
def conn():
    c = sqlite3.connect(DB_PATH)
    c.execute("PRAGMA foreign_keys = ON")
    try:
        yield c
        c.commit()
    finally:
        c.close()


def query(sql, params=()):
    with conn() as c:
        return pd.read_sql_query(sql, c, params=params)


def execute(sql, params=()):
    with conn() as c:
        return c.execute(sql, params).lastrowid


def init_db():
    with conn() as c:
        c.executescript(SCHEMA)


def get_or_create_workout(fecha, routine_name):
    execute(
        "INSERT OR IGNORE INTO workouts(date, routine_name) VALUES (?, ?)",
        (fecha, routine_name),
    )
    df = query(
        "SELECT id FROM workouts WHERE date=? AND routine_name=?",
        (fecha, routine_name),
    )
    return int(df["id"].iloc[0])


# ----------------------------------------------------------------- contraseña opcional
def gate():
    """Si definís APP_PASSWORD en los Secrets de Streamlit, pide clave."""
    try:
        pwd = st.secrets["APP_PASSWORD"]
    except Exception:
        return
    if st.session_state.get("auth_ok"):
        return
    st.title("🏋️ Gym Tracker")
    entered = st.text_input("Contraseña", type="password")
    if entered:
        if entered == pwd:
            st.session_state["auth_ok"] = True
            st.rerun()
        else:
            st.error("Contraseña incorrecta")
    st.stop()


# ----------------------------------------------------------------- página: entrenar
def exercise_block(i, ex, target, fecha, rname):
    today = query(
        """SELECT s.id, s.set_no, s.weight, s.reps, s.rir
           FROM sets s JOIN workouts w ON w.id = s.workout_id
           WHERE w.date = ? AND w.routine_name = ? AND s.exercise = ?
           ORDER BY s.set_no""",
        (fecha, rname, ex),
    )
    last = query(
        """SELECT w.date, s.set_no, s.weight, s.reps, s.rir
           FROM sets s JOIN workouts w ON w.id = s.workout_id
           WHERE s.exercise = ? AND w.date < ?
           ORDER BY w.date DESC, s.set_no""",
        (ex, fecha),
    )
    if not last.empty:
        last = last[last["date"] == last["date"].iloc[0]]

    with st.expander(f"{ex}  ·  {len(today)}/{target} series", expanded=(len(today) < target)):
        if not last.empty:
            txt = " · ".join(
                f"{r.weight:g}×{int(r.reps)}" + ("" if pd.isna(r.rir) else f" (RIR {int(r.rir)})")
                for r in last.itertuples()
            )
            st.caption(f"Última vez ({last['date'].iloc[0]}): {txt}")

        for r in today.itertuples():
            a, b = st.columns([5, 1])
            rir_txt = "-" if pd.isna(r.rir) else int(r.rir)
            a.write(f"**Serie {int(r.set_no)}** · {r.weight:g} kg × {int(r.reps)} · RIR {rir_txt}")
            if b.button("🗑", key=f"del_set_{r.id}"):
                execute("DELETE FROM sets WHERE id = ?", (int(r.id),))
                st.rerun()

        # valores por defecto: última serie de hoy, o primera de la vez anterior
        if not today.empty:
            ref = today.iloc[-1]
        elif not last.empty:
            ref = last.iloc[0]
        else:
            ref = None
        dw = float(ref["weight"]) if ref is not None else 0.0
        dr = int(ref["reps"]) if ref is not None else 8
        drir = int(ref["rir"]) if ref is not None and not pd.isna(ref["rir"]) else 2

        with st.form(f"form_{i}"):
            c1, c2, c3 = st.columns(3)
            w = c1.number_input("Peso (kg)", min_value=0.0, step=2.5, value=dw, key=f"w_{i}")
            reps = c2.number_input("Reps", min_value=1, step=1, value=dr, key=f"r_{i}")
            rir = c3.number_input("RIR", min_value=0, max_value=10, step=1, value=drir, key=f"rir_{i}")
            if st.form_submit_button("Guardar serie", type="primary"):
                wid = get_or_create_workout(fecha, rname)
                n = int(today["set_no"].max()) + 1 if not today.empty else 1
                execute(
                    "INSERT INTO sets(workout_id, exercise, set_no, weight, reps, rir) VALUES (?,?,?,?,?,?)",
                    (wid, ex, n, float(w), int(reps), int(rir)),
                )
                st.rerun()


def page_train():
    st.subheader("Entrenar")
    routines = query("SELECT id, name FROM routines ORDER BY name")
    if routines.empty:
        st.info("Primero creá una rutina en la pestaña 📋 Rutinas.")
        return

    c1, c2 = st.columns(2)
    rname = c1.selectbox("Rutina", routines["name"].tolist())
    fecha = c2.date_input("Fecha", date.today()).isoformat()
    rid = int(routines.loc[routines["name"] == rname, "id"].iloc[0])

    ex_df = query(
        "SELECT exercise, target_sets FROM routine_exercises WHERE routine_id = ? ORDER BY position, id",
        (rid,),
    )
    items = [(r.exercise, int(r.target_sets)) for r in ex_df.itertuples()]

    extras = st.session_state.setdefault("extras", {}).setdefault(rname, [])
    for e in extras:
        if e not in [n for n, _ in items]:
            items.append((e, 3))

    with st.expander("➕ Ejercicio extra solo por hoy"):
        new = st.text_input("Nombre del ejercicio", key="extra_name")
        if st.button("Agregar", key="extra_btn") and new.strip():
            extras.append(new.strip())
            st.rerun()

    if not items:
        st.info("Esta rutina no tiene ejercicios todavía. Agregalos en 📋 Rutinas.")
        return

    for i, (ex, target) in enumerate(items):
        exercise_block(i, ex, target, fecha, rname)


# ----------------------------------------------------------------- página: rutinas
def reorder(ids):
    with conn() as c:
        for pos, _id in enumerate(ids):
            c.execute("UPDATE routine_exercises SET position = ? WHERE id = ?", (pos, int(_id)))


def page_routines():
    st.subheader("Rutinas")

    with st.form("new_routine", clear_on_submit=True):
        name = st.text_input("Nueva rutina (ej: Push, Pierna, Día 1)")
        if st.form_submit_button("Crear rutina") and name.strip():
            try:
                execute("INSERT INTO routines(name) VALUES (?)", (name.strip(),))
            except sqlite3.IntegrityError:
                st.error("Ya existe una rutina con ese nombre.")
            else:
                st.rerun()

    routines = query("SELECT id, name FROM routines ORDER BY name")
    if routines.empty:
        return

    st.divider()
    rname = st.selectbox("Editar rutina", routines["name"].tolist())
    rid = int(routines.loc[routines["name"] == rname, "id"].iloc[0])

    with st.form("new_ex", clear_on_submit=True):
        c1, c2 = st.columns([3, 1])
        ex = c1.text_input("Agregar ejercicio")
        sets_n = c2.number_input("Series", min_value=1, max_value=20, value=3)
        if st.form_submit_button("Agregar ejercicio") and ex.strip():
            pos = query(
                "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM routine_exercises WHERE routine_id = ?",
                (rid,),
            )["p"].iloc[0]
            execute(
                "INSERT INTO routine_exercises(routine_id, exercise, target_sets, position) VALUES (?,?,?,?)",
                (rid, ex.strip(), int(sets_n), int(pos)),
            )
            st.rerun()

    exs = query(
        "SELECT id, exercise, target_sets FROM routine_exercises WHERE routine_id = ? ORDER BY position, id",
        (rid,),
    )
    ids = exs["id"].tolist()
    for idx, r in enumerate(exs.itertuples()):
        a, b, c, d = st.columns([6, 1, 1, 1])
        a.write(f"**{idx + 1}. {r.exercise}** · {int(r.target_sets)} series")
        if b.button("⬆", key=f"up_{r.id}", disabled=idx == 0):
            ids[idx - 1], ids[idx] = ids[idx], ids[idx - 1]
            reorder(ids)
            st.rerun()
        if c.button("⬇", key=f"dn_{r.id}", disabled=idx == len(ids) - 1):
            ids[idx + 1], ids[idx] = ids[idx], ids[idx + 1]
            reorder(ids)
            st.rerun()
        if d.button("🗑", key=f"rmex_{r.id}"):
            execute("DELETE FROM routine_exercises WHERE id = ?", (int(r.id),))
            st.rerun()

    st.divider()
    with st.expander("Eliminar esta rutina"):
        st.caption("Tu historial de entrenamientos no se borra.")
        if st.checkbox("Sí, quiero eliminar esta rutina", key="confirm_rm_routine"):
            if st.button("Eliminar rutina", type="primary"):
                execute("DELETE FROM routines WHERE id = ?", (rid,))
                st.rerun()


# ----------------------------------------------------------------- página: progreso
def page_progress():
    st.subheader("Progreso")
    df = query(
        """SELECT w.date, s.exercise, s.set_no, s.weight, s.reps, s.rir
           FROM sets s JOIN workouts w ON w.id = s.workout_id"""
    )
    if df.empty:
        st.info("Todavía no hay series registradas.")
        return

    df["date"] = pd.to_datetime(df["date"])
    df["e1rm"] = df["weight"] * (1 + df["reps"] / 30)  # fórmula de Epley
    df["volume"] = df["weight"] * df["reps"]

    ex = st.selectbox("Ejercicio", sorted(df["exercise"].unique()))
    d = df[df["exercise"] == ex]
    daily = (
        d.groupby("date")
        .agg(peso_max=("weight", "max"), e1rm=("e1rm", "max"), volumen=("volume", "sum"), series=("set_no", "count"))
        .reset_index()
    )

    m1, m2, m3 = st.columns(3)
    m1.metric("Mejor peso", f"{d['weight'].max():g} kg")
    m2.metric("1RM estimado", f"{d['e1rm'].max():.1f} kg")
    m3.metric("Sesiones", len(daily))

    cfg = {"displayModeBar": False}
    tabs = st.tabs(["Peso máx", "1RM est.", "Volumen"])
    for tab, col, label in zip(
        tabs, ["peso_max", "e1rm", "volumen"], ["Peso máximo (kg)", "1RM estimado (kg)", "Volumen (kg·reps)"]
    ):
        with tab:
            fig = px.line(daily, x="date", y=col, markers=True)
            fig.update_layout(margin=dict(l=10, r=10, t=10, b=10), xaxis_title=None, yaxis_title=label)
            st.plotly_chart(fig, width="stretch", config=cfg)

    with st.expander("Tabla por sesión"):
        show = daily.sort_values("date", ascending=False).copy()
        show["date"] = show["date"].dt.date
        st.dataframe(show.round(1), hide_index=True)

    st.divider()
    st.markdown("**Constancia semanal**")
    sessions = df.drop_duplicates(["date"])[["date"]].copy()
    sessions["semana"] = sessions["date"].dt.to_period("W").dt.start_time
    weekly = sessions.groupby("semana").size().reset_index(name="entrenamientos")
    fig = px.bar(weekly, x="semana", y="entrenamientos")
    fig.update_layout(margin=dict(l=10, r=10, t=10, b=10), xaxis_title=None, yaxis_title="Días entrenados")
    st.plotly_chart(fig, width="stretch", config=cfg)


# ----------------------------------------------------------------- página: historial
def page_history():
    st.subheader("Historial")
    limit = st.number_input("Cuántos entrenamientos mostrar", min_value=5, max_value=200, value=15, step=5)
    ws = query(
        """SELECT w.id, w.date, w.routine_name FROM workouts w
           WHERE EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = w.id)
           ORDER BY w.date DESC, w.id DESC LIMIT ?""",
        (int(limit),),
    )
    if ws.empty:
        st.info("Todavía no hay entrenamientos.")
        return
    for w in ws.itertuples():
        with st.expander(f"{w.date} · {w.routine_name}"):
            sets_df = query(
                """SELECT exercise AS Ejercicio, set_no AS Serie, weight AS Peso, reps AS Reps, rir AS RIR
                   FROM sets WHERE workout_id = ? ORDER BY exercise, set_no""",
                (int(w.id),),
            )
            st.dataframe(sets_df, hide_index=True)
            if st.button("Eliminar este entrenamiento", key=f"rm_w_{w.id}"):
                execute("DELETE FROM workouts WHERE id = ?", (int(w.id),))
                st.rerun()


# ----------------------------------------------------------------- página: respaldo
def page_backup():
    st.subheader("Respaldo")
    st.warning(
        "Streamlit Community Cloud puede reiniciar o reconstruir la app y, cuando eso pasa, "
        "los archivos creados mientras la usás (como gym.db) se pierden. "
        "Bajá un respaldo seguido y restauralo si hace falta."
    )

    if DB_PATH.exists():
        st.download_button(
            "⬇️ Descargar respaldo (gym.db)",
            data=DB_PATH.read_bytes(),
            file_name=f"gym_backup_{date.today().isoformat()}.db",
            mime="application/octet-stream",
        )
        sets_all = query(
            """SELECT w.date, w.routine_name, s.exercise, s.set_no, s.weight, s.reps, s.rir
               FROM sets s JOIN workouts w ON w.id = s.workout_id ORDER BY w.date, s.exercise, s.set_no"""
        )
        st.download_button(
            "⬇️ Exportar series a CSV",
            data=sets_all.to_csv(index=False).encode("utf-8"),
            file_name="gym_series.csv",
            mime="text/csv",
        )

    st.divider()
    st.markdown("**Restaurar desde un respaldo**")
    up = st.file_uploader("Subí tu archivo .db", type=["db", "sqlite"])
    if up is not None and st.button("Restaurar (reemplaza los datos actuales)", type="primary"):
        tmp = DB_PATH.with_suffix(".tmp")
        tmp.write_bytes(up.getvalue())
        try:
            c = sqlite3.connect(tmp)
            names = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            c.close()
            if not {"routines", "routine_exercises", "workouts", "sets"} <= names:
                raise ValueError("Faltan tablas")
        except Exception:
            tmp.unlink(missing_ok=True)
            st.error("Ese archivo no parece un respaldo válido de esta app.")
        else:
            tmp.replace(DB_PATH)
            st.success("Datos restaurados.")
            st.rerun()


# ----------------------------------------------------------------- main
def main():
    gate()
    init_db()
    st.title("🏋️ Gym Tracker")
    pages = {
        "🏋️ Entrenar": page_train,
        "📋 Rutinas": page_routines,
        "📈 Progreso": page_progress,
        "🗓 Historial": page_history,
        "💾 Respaldo": page_backup,
    }
    choice = st.radio("Sección", list(pages), horizontal=True, label_visibility="collapsed")
    st.divider()
    pages[choice]()


main()
