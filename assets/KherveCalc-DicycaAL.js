import{a as e}from"./rolldown-runtime-B0Z9INg1.js";import{i as t}from"./react-CgaLaEa2.js";import{M as n,t as r,w as i}from"./os-Et0zSH6z.js";import{G as a,J as o,K as s,Q as c,V as l,X as u,rt as d,x as f,y as p}from"./windows-C2bSSbNk.js";import{t as m}from"./arrow-down-to-line-DV4aKfXC.js";import{t as h}from"./clipboard-copy-NUn2ruhO.js";import{t as g}from"./crosshair-CnMiElMd.js";import{t as _}from"./eraser-CWvia5FA.js";import{t as v}from"./eye-off-DrCd6aHU.js";import{t as y}from"./eye-BwvIKQBZ.js";import{t as b}from"./grid-3x3-B0hcYt8Y.js";import{t as x}from"./keyboard-CI6hKeYP.js";import{t as S}from"./maximize-BWbEa1Bn.js";import{t as C}from"./panel-right-DnPSApQV.js";import{t as w}from"./play-B0cb4E5a.js";import{t as T}from"./save-Bjty7Vjq.js";import{t as E}from"./square-function-BZaMoNEy.js";import{t as D}from"./square-C5111Iej.js";import{t as O}from"./table-2-B-oTbDEn.js";import{t as ee}from"./zoom-in-B9Rd9-rL.js";import{t as k}from"./zoom-out-D28oIYPf.js";import{n as A,t as j}from"./path-CtZiOU3c.js";import{X as M,at as N,it as P,lt as F,mt as I,rt as te}from"./index-C2cyRZpe.js";import{a as ne}from"./appTools-BI0J0oLB.js";import{n as L,t as re}from"./kernel-piWDUbRM.js";import{t as ie}from"./CodeEditor-D7KkJeZ5.js";import{t as R}from"./katex.min-BjO6B8my.js";var ae={name:`arrow-left-right`,size:24,node:[[`path`,{d:`M8 3 4 7l4 4`,key:`9rb6wj`}],[`path`,{d:`M4 7h16`,key:`6tx8e3`}],[`path`,{d:`m16 21 4-4-4-4`,key:`siv7j2`}],[`path`,{d:`M20 17H4`,key:`h6l3hr`}]]};ae.node;var oe=d(ae),se={name:`corner-down-left`,size:24,node:[[`path`,{d:`M20 4v7a4 4 0 0 1-4 4H4`,key:`6o5b7l`}],[`path`,{d:`m9 10-5 5 5 5`,key:`1kshq7`}]]};se.node;var ce=d(se),le={name:`variable`,size:24,node:[[`path`,{d:`M8 21s-4-3-4-9 4-9 4-9`,key:`uto9ud`}],[`path`,{d:`M16 3s4 3 4 9-4 9-4 9`,key:`4w2vsq`}],[`line`,{x1:`15`,x2:`9`,y1:`9`,y2:`15`,key:`f7djnv`}],[`line`,{x1:`9`,x2:`15`,y1:`9`,y2:`15`,key:`1shsy8`}]]};le.node;var ue=d(le),z=e(t(),1),de=`"""kcalc_engine — KherveCalc's maths engine (SymPy + mpmath + NumPy + SciPy).

Runs in the KherveCalc window's own Pyodide worker (and in plain CPython for
the tests). One entry point:

    call(b64)      base64 of a JSON request {"op": ..., ...}  ->  base64 JSON answer
    emit(b64)      the same, printed between markers (what the browser uses)
    dispatch(req)  the same with dicts (tests)

Expressions are calculator-style: ^ is a power, 2x and sin x multiply/apply,
x := 3 and f(x) := x^2 define, a = b is an equation, 3_m/_s*2_h has units,
#c is a CODATA constant, expr ▶ _km/_h converts, [[1,2],[3,4]] is a matrix.
"""

import base64
import json
import math
import re
import sys

import mpmath
import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    function_exponentiation,
    implicit_application,
    implicit_multiplication,
    parse_expr,
    standard_transformations,
)
from sympy.physics import units as U
from sympy.physics.units import Quantity
from sympy.physics.units.systems.si import SI, dimsys_SI

VERSION = "1.0"
if hasattr(sys, "set_int_max_str_digits"):
    sys.set_int_max_str_digits(0)  # 1000! has 2568 digits; this kernel is the calculator's own
HUGE_BITS = 70000  # integers longer than ~21,000 digits are shown in scientific notation
TRANSFORMS = standard_transformations + (convert_xor, implicit_multiplication, implicit_application, function_exponentiation)

# --------------------------------------------------------------------- state

SETTINGS = {"number": "exact", "digits": 12, "angle": "rad", "complex": "rect"}
VARS: dict = {}          # name -> value (sympy)
FUNCS: dict = {}         # name -> sympy Lambda
DEF_SRC: dict = {}       # name -> the source line that defined it
HIST: dict = {}          # history id -> result value
HIST_ORDER: list = []
LISTS: dict = {}         # L1..L6 from the statistics editor
PROGRAM_NS: dict = {}    # the Python cell's namespace (Programs tab), set by the bridge
MAX_HIST = 500


class CalcError(Exception):
    """A message for the user (no traceback)."""


# --------------------------------------------------------------------- units

def _q(name, abbrev, dim, factor):
    q = Quantity(name, abbrev=abbrev)
    q.kc_name = abbrev
    SI.set_quantity_dimension(q, dim)
    SI.set_quantity_scale_factor(q, factor)
    return q



_EXTRA = {}


def _extra(name, abbrev, dim, factor):
    q = _q(name, abbrev, dim, factor)
    _EXTRA[abbrev] = q
    return q


# Units SymPy lacks (scale factors in SI).
_extra("kilojoule", "kJ", U.energy, 1000 * U.joule)
_extra("calorie", "cal", U.energy, sp.Rational(4184, 1000) * U.joule)
_extra("kilocalorie", "kcal", U.energy, 4184 * U.joule)
_extra("watthour", "Wh", U.energy, 3600 * U.joule)
_extra("kilowatthour", "kWh", U.energy, 3600000 * U.joule)
_extra("british_thermal_unit", "BTU", U.energy, sp.Rational("1055.05585262") * U.joule)
_extra("erg", "erg", U.energy, sp.Rational(1, 10**7) * U.joule)
_extra("hartree_energy", "Eh", U.energy, sp.Rational("4.3597447222060e-18") * U.joule)
_extra("rydberg_energy", "Ry", U.energy, sp.Rational("2.1798723611030e-18") * U.joule)
_extra("ounce", "oz", U.mass, sp.Rational("0.028349523125") * U.kg)
_extra("pound_mass", "lb", U.mass, sp.Rational("0.45359237") * U.kg)
_extra("stone", "st", U.mass, sp.Rational("6.35029318") * U.kg)
_extra("carat", "ct", U.mass, sp.Rational(2, 10000) * U.kg)
_extra("gallon", "gal", U.length**3, sp.Rational("0.003785411784") * U.m**3)
_extra("imperial_gallon", "galUK", U.length**3, sp.Rational("0.00454609") * U.m**3)
_extra("quart", "qt", U.length**3, sp.Rational("0.000946352946") * U.m**3)
_extra("pint", "pt", U.length**3, sp.Rational("0.000473176473") * U.m**3)
_extra("fluid_ounce", "floz", U.length**3, sp.Rational("0.0000295735295625") * U.m**3)
_extra("cup", "cup", U.length**3, sp.Rational("0.0002365882365") * U.m**3)
_extra("parsec", "pc", U.length, sp.Rational("3.0856775814913673e16") * U.m)
_extra("micron", "micron", U.length, sp.Rational(1, 10**6) * U.m)
_extra("fermi", "fm", U.length, sp.Rational(1, 10**15) * U.m)
_extra("bohr", "a0", U.length, sp.Rational("5.29177210544e-11") * U.m)
_extra("knot", "kn", U.velocity, sp.Rational(1852, 3600) * U.m / U.s)
_extra("acre", "acre", U.length**2, sp.Rational("4046.8564224") * U.m**2)
_extra("barn", "barn", U.length**2, sp.Rational(1, 10**28) * U.m**2)
_extra("week", "wk", U.time, 604800 * U.s)
_extra("pound_force", "lbf", U.force, sp.Rational("4.4482216152605") * U.newton)
_extra("kilogram_force", "kgf", U.force, sp.Rational("9.80665") * U.newton)
_extra("dyne", "dyn", U.force, sp.Rational(1, 10**5) * U.newton)
_extra("horsepower", "hp", U.power, sp.Rational("745.69987158227022") * U.watt)
_extra("gauss", "G", U.magnetic_density, sp.Rational(1, 10**4) * U.tesla)
_extra("curie", "Ci", 1 / U.time, 37 * 10**9 / U.s)
_extra("rpm", "rpm", 1 / U.time, sp.Rational(1, 60) / U.s)
_extra("electron_volt_mass", "eVc2", U.mass, sp.Rational("1.78266192162790e-36") * U.kg)
_extra("lumen", "lm", U.luminous_intensity, U.candela * U.steradian)
_extra("sievert", "Sv", U.length**2 / U.time**2, U.joule / U.kg)
_extra("femtosecond", "fs", U.time, sp.Rational(1, 10**15) * U.second)
_extra("molar", "M", U.amount_of_substance / U.length**3, 1000 * U.mol / U.m**3)

PREFIXES = {
    "Q": 30, "R": 27, "Y": 24, "Z": 21, "E": 18, "P": 15, "T": 12, "G": 9, "M": 6, "k": 3, "h": 2, "da": 1,
    "d": -1, "c": -2, "m": -3, "u": -6, "µ": -6, "μ": -6, "n": -9, "p": -12, "f": -15, "a": -18, "z": -21, "y": -24, "r": -27, "q": -30,
}

# Base names a prefix may go on (kPa, MHz, nF, µA…), and every unit by name.
PREFIXABLE = {
    "m": U.meter, "g": U.gram, "s": U.second, "A": U.ampere, "K": U.kelvin, "mol": U.mole, "cd": U.candela,
    "Hz": U.hertz, "N": U.newton, "Pa": U.pascal, "J": U.joule, "W": U.watt, "C": U.coulomb, "V": U.volt,
    "F": U.farad, "ohm": U.ohm, "Ω": U.ohm, "S": U.siemens, "Wb": U.weber, "T": U.tesla, "H": U.henry,
    "L": U.liter, "l": U.liter, "eV": U.electronvolt, "bar": U.bar, "Gy": U.gray, "Bq": U.becquerel,
    "lm": _EXTRA["lm"], "lx": U.lux, "Sv": _EXTRA["Sv"], "kat": U.katal,
}
_prefixed_cache: dict = {}


def _prefixed(prefix, base):
    key = prefix + base
    if key in _prefixed_cache:
        return _prefixed_cache[key]
    unit = PREFIXABLE[base]
    exp = PREFIXES[prefix]
    name = {"µ": "u", "μ": "u"}.get(prefix, prefix) + base
    q = _q(f"kc_{name}", key, SI.get_quantity_dimension(unit), sp.Integer(10) ** exp * unit)
    q.kc_name = key
    _prefixed_cache[key] = q
    return q


UNITS = {
    # length
    "m": U.meter, "km": U.km, "cm": U.cm, "mm": U.mm, "um": U.um, "µm": U.um, "μm": U.um, "nm": U.nm, "pm": U.pm,
    "Å": U.angstrom, "angstrom": U.angstrom, "in": U.inch, "inch": U.inch, "ft": U.foot, "yd": U.yard, "mi": U.mile,
    "mile": U.mile, "nmi": U.nautical_mile, "au": U.astronomical_unit, "AU": U.astronomical_unit, "ly": U.lightyear,
    # mass
    "kg": U.kg, "g": U.gram, "mg": U.mg, "ug": U.ug, "µg": U.ug, "t": U.tonne, "tonne": U.tonne, "Da": U.dalton,
    "amu": U.amu, "u": U.amu,
    # time
    "s": U.second, "ms": U.ms, "us": U.us, "µs": U.us, "ns": U.ns, "ps": U.ps, "fs": _EXTRA["fs"], "min": U.minute,
    "h": U.hour, "hr": U.hour, "d": U.day, "day": U.day, "yr": U.year, "year": U.year, "a": U.year,
    # electric, thermal, amount, light
    "A": U.ampere, "K": U.kelvin, "mol": U.mole, "cd": U.candela, "C": U.coulomb, "V": U.volt, "ohm": U.ohm,
    "Ω": U.ohm, "S": U.siemens, "F": U.farad, "H": U.henry, "T": U.tesla, "Wb": U.weber,
    # derived
    "N": U.newton, "J": U.joule, "W": U.watt, "Pa": U.pascal, "Hz": U.hertz, "eV": U.electronvolt,
    "L": U.liter, "l": U.liter, "mL": U.ml, "ml": U.ml, "bar": U.bar, "atm": U.atmosphere, "psi": U.psi,
    "mmHg": U.mmHg, "Torr": U.torr, "torr": U.torr, "ha": U.hectare, "deg": U.degree, "rad": U.radian,
    "sr": U.steradian, "Gy": U.gray, "Bq": U.becquerel, "Sv": _EXTRA["Sv"], "lm": _EXTRA["lm"], "lx": U.lux,
    "kat": U.katal, "c0": U.speed_of_light,
}
UNITS.update(_EXTRA)

# Short names in the LaTeX output (km/h, not kilometer/hour).
_named = set()
for _k, _u in UNITS.items():
    if isinstance(_u, Quantity) and id(_u) not in _named:
        _named.add(id(_u))
        if _k in ("ohm", "Ω"):
            _u._latex_repr = r"\\Omega"
        elif _k in ("um", "µm", "μm"):
            _u._latex_repr = r"\\mu\\mathrm{m}"
        elif _k == "deg":
            _u._latex_repr = r"^{\\circ}"
        else:
            _u._latex_repr = r"\\mathrm{" + _k.replace("Å", r"\\AA") + "}"
        _u.kc_name = _k

# Temperatures with an offset: only in conversions of a plain value.
TEMPS = {"K": (1, 0), "degC": (1, sp.Rational(27315, 100)), "°C": (1, sp.Rational(27315, 100)),
         "degF": (sp.Rational(5, 9), sp.Rational(45967, 100)), "°F": (sp.Rational(5, 9), sp.Rational(45967, 100)),
         "degR": (sp.Rational(5, 9), 0), "°R": (sp.Rational(5, 9), 0)}


def lookup_unit(name):
    if name in UNITS:
        return UNITS[name]
    if name in ("degC", "degF", "degR"):
        raise CalcError(f"_{name} has an offset: convert temperatures with the Units tab or convert(20, \\"degC\\", \\"K\\").")
    for plen in (2, 1):
        p, base = name[:plen], name[plen:]
        if p in PREFIXES and base in PREFIXABLE:
            return _prefixed(p, base)
    raise CalcError(f"Unknown unit _{name}")


def has_units(e):
    return isinstance(e, sp.Basic) and bool(e.atoms(Quantity))


def _dims(q):
    return dimsys_SI.get_dimensional_dependencies(SI.get_quantity_dimension(q))


SI_BASE = [U.meter, U.kilogram, U.second, U.ampere, U.kelvin, U.mole, U.candela]
NAMED_DERIVED = [U.newton, U.joule, U.watt, U.pascal, U.coulomb, U.volt, U.ohm, U.farad, U.henry, U.tesla,
                 U.weber, U.siemens, U.hertz]


def _dim_of(expr):
    try:
        d = U.Dimension(SI.get_dimensional_expr(expr))
        return dimsys_SI.get_dimensional_dependencies(d)
    except Exception:
        return None


def simplify_units(e):
    """3 m/s * 2 h -> 21600 m; 2 kg * 3 m/s^2 -> 6 N; 1 m + 20 cm -> 6/5 m. Keeps 5 km and 90 km/h."""
    if not has_units(e) or not isinstance(e, sp.Expr):
        return e
    qs = list(e.atoms(Quantity))
    if len(qs) <= 1:
        return e
    seen = {}
    clash = False
    for q in qs:
        for base in _dims(q):
            if base in seen and seen[base] != q:
                clash = True
            seen[base] = q
    r = U.convert_to(e, SI_BASE) if clash else e
    if len(r.atoms(Quantity)) > 1:
        want = _dim_of(r)
        for d in NAMED_DERIVED:
            if want and _dims(d) == want:
                return U.convert_to(r, d)
    return r


def convert_units(e, target):
    if isinstance(target, str):
        target = parse_unit_text(target)
    if not has_units(target):
        raise CalcError("Convert to a unit, e.g. ▶ _km/_h")
    if not has_units(e):
        raise CalcError("Nothing to convert: the value has no unit.")
    r = U.convert_to(e, target)
    left = r / target
    left = sp.simplify(left)
    if has_units(left):
        de, dt = _dim_of(e), _dim_of(target)
        raise CalcError(f"Incompatible units ({_dimtext(de)} vs {_dimtext(dt)}).")
    return sp.Mul(left, target, evaluate=False) if left != 1 else target


def _dimtext(d):
    if not d:
        return "dimensionless"
    return " ".join(f"{str(k).replace('Dimension(', '').rstrip(')').split(',')[0]}^{v}" if v != 1 else str(k).replace("Dimension(", "").rstrip(")").split(",")[0] for k, v in d.items())


_UNIT_TOKEN = re.compile(r"([A-Za-zµμΩÅ°][A-Za-z0-9µμΩÅ°]*)(\\^(-?\\d+))?")


def parse_unit_text(text):
    """'km/h', 'm s^-1', 'J K^-1 mol^-1', '_m/_s' -> a SymPy unit expression."""
    t = text.strip().replace("_", "").replace("·", " ").replace("*", " ").replace("**", "^")
    if not t:
        raise CalcError("Empty unit")
    num, den = (t.split("/", 1) + [""])[:2]
    out = sp.Integer(1)
    for part, sign in ((num, 1), (den, -1)):
        for tok in part.replace("(", " ").replace(")", " ").split():
            m = _UNIT_TOKEN.fullmatch(tok)
            if not m:
                if tok == "1":
                    continue
                raise CalcError(f"Unknown unit '{tok}'")
            power = int(m.group(3)) if m.group(3) else 1
            out *= lookup_unit(m.group(1)) ** (power * sign)
    return out


def convert_value(value, frm, to):
    """Value in unit \`frm\` -> unit \`to\` (handles °C/°F/°R offsets)."""
    v = sp.sympify(value) if not isinstance(value, sp.Basic) else value
    fk, tk = frm.strip().lstrip("_"), to.strip().lstrip("_")
    if fk in TEMPS and tk in TEMPS:
        a, b = TEMPS[fk]
        kelvin = (v + b) * a
        c, d = TEMPS[tk]
        out = kelvin / c - d
        return sp.nsimplify(out) if v.is_Rational else out
    q = v * parse_unit_text(frm)
    r = convert_units(q, parse_unit_text(to))
    return r


def unit_catalog():
    cats = {}
    for name, q in UNITS.items():
        if name in ("c0",):
            continue
        try:
            d = SI.get_quantity_dimension(q)
            key = str(d.name)
        except Exception:
            key = "other"
        cats.setdefault(key, []).append(name)
    return cats


# ---------------------------------------------------------------- constants

ALIASES = {
    "c": "speed of light in vacuum", "h": "Planck constant", "hbar": "reduced Planck constant",
    "e": "elementary charge", "me": "electron mass", "mp": "proton mass", "mn": "neutron mass",
    "mu": "atomic mass constant", "NA": "Avogadro constant", "kB": "Boltzmann constant", "k": "Boltzmann constant",
    "R": "molar gas constant", "F": "Faraday constant", "G": "Newtonian constant of gravitation",
    "g": "standard acceleration of gravity", "g0": "standard acceleration of gravity",
    "eps0": "vacuum electric permittivity", "mu0": "vacuum mag. permeability", "a0": "Bohr radius",
    "Rinf": "Rydberg constant", "alpha": "fine-structure constant", "sigma": "Stefan-Boltzmann constant",
    "muB": "Bohr magneton", "muN": "nuclear magneton", "Eh": "Hartree energy", "Z0": "characteristic impedance of vacuum",
    "Phi0": "mag. flux quantum", "KJ": "Josephson constant", "RK": "von Klitzing constant", "b": "Wien wavelength displacement law constant",
    "atm": "standard atmosphere", "re": "classical electron radius", "lambdaC": "Compton wavelength",
    "md": "deuteron mass", "malpha": "alpha particle mass", "G0": "conductance quantum", "Vm": "molar volume of ideal gas (273.15 K, 100 kPa)",
    "eV": "electron volt", "u": "atomic mass constant", "gamma_e": "electron gyromag. ratio", "mue": "electron mag. mom.",
}
_CONST_CACHE: dict = {}


def _codata():
    try:
        import scipy.constants as sc
        return sc.physical_constants
    except Exception:  # pragma: no cover
        return {}


def _const_unit(text):
    if not text:
        return sp.Integer(1)
    try:
        return parse_unit_text(text.replace("E_h", "Eh").replace("ohm", "ohm"))
    except CalcError:
        return None


def constant(name):
    key = ALIASES.get(name, name)
    if key in _CONST_CACHE:
        return _CONST_CACHE[key]
    table = _codata()
    if key not in table:
        low = {k.lower(): k for k in table}
        if key.lower() in low:
            key = low[key.lower()]
        else:
            raise CalcError(f"Unknown constant #{name} (see the Constants panel)")
    value, unit, unc = table[key]
    num = sp.Integer(int(value)) if float(value).is_integer() and abs(value) < 1e16 and unc == 0 else sp.Float(repr(float(value)), 20)
    u = _const_unit(unit)
    out = num * u if u is not None else num
    _CONST_CACHE[key] = out
    return out


def constants_list():
    table = _codata()
    rev = {}
    for a, k in ALIASES.items():
        rev.setdefault(k, []).append(a)
    out = []
    for k, (v, unit, unc) in table.items():
        out.append({"name": k, "alias": rev.get(k, [None])[0], "value": repr(float(v)), "unit": unit, "uncertainty": repr(float(unc)),
                    "exact": unc == 0})
    out.sort(key=lambda c: (c["alias"] is None, c["name"]))
    return out


# --------------------------------------------------------------- functions

x_, t_ = sp.symbols("x t")


def _angle_factor():
    a = SETTINGS.get("angle", "rad")
    return sp.pi / 180 if a == "deg" else sp.pi / 200 if a == "grad" else sp.Integer(1)


def _to_rad(v):
    f = _angle_factor()
    return v if f == 1 else v * f


def _from_rad(v):
    f = _angle_factor()
    return v if f == 1 else v / f


def _fwd(fn):
    def f(v, **kw):  # parse_expr(evaluate=False) passes evaluate=False
        return fn(_to_rad(v), **kw)
    f.__name__ = fn.__name__
    return f


def _inv(fn):
    def f(v, **kw):
        return _from_rad(fn(v, **kw))
    f.__name__ = fn.__name__
    return f


def _seq(v):
    """A list of values from a matrix, list, tuple or a single value."""
    if isinstance(v, sp.MatrixBase):
        return list(v)
    if isinstance(v, (list, tuple, sp.Tuple)):
        out = []
        for i in v:
            out.extend(_seq(i))
        return out
    return [v]


def _args_seq(args):
    if len(args) == 1:
        return _seq(args[0])
    out = []
    for a in args:
        out.extend(_seq(a))
    return out


def _num(v, what="value"):
    v = sp.sympify(v)
    if not v.is_number:
        raise CalcError(f"The {what} must be a number")
    return v


def _mpf(v):
    return mpmath.mpmathify(sp.N(_num(v), mpmath.mp.dps + 5))


def _float_result(v):
    if isinstance(v, (mpmath.mpc, complex)):
        return sp.Float(mpmath.re(v), mpmath.mp.dps) + sp.I * sp.Float(mpmath.im(v), mpmath.mp.dps) if mpmath.im(v) != 0 else sp.Float(mpmath.re(v), mpmath.mp.dps)
    return sp.Float(v, mpmath.mp.dps)


def _with_dps(fn):
    old = mpmath.mp.dps
    mpmath.mp.dps = max(15, int(SETTINGS.get("digits", 15)) + 5)
    try:
        return fn()
    finally:
        mpmath.mp.dps = old


def f_log(v, b=None, **kw):
    """log(x) is base 10 (calculator style); log(x, b) base b; ln is natural."""
    if b is None:
        return sp.log(v, 10, **kw)
    return sp.log(v, b, **kw)


def f_root(v, n):
    if n == 3 or n == -3 or (getattr(v, "is_real", False) and getattr(n, "is_odd", False)):
        return sp.real_root(v, n)
    return sp.root(v, n)


def f_round(v, n=0):
    if isinstance(v, sp.MatrixBase):
        return v.applyfunc(lambda e: f_round(e, n))
    v = sp.sympify(v)
    if v.is_number and not v.is_real:
        return f_round(sp.re(v), n) + sp.I * f_round(sp.im(v), n)
    n = int(n)
    if v.is_Rational or v.is_Integer:
        q = v * sp.Integer(10) ** n
        r = sp.floor(q + sp.Rational(1, 2)) if q >= 0 else -sp.floor(-q + sp.Rational(1, 2))
        return r / sp.Integer(10) ** n
    q = sp.Rational(str(sp.N(v, max(30, n + 20))))
    return sp.Float(f_round(q, n), max(15, n + 2))


def f_frac(v):
    return v - sp.floor(v) if v.is_real else v - sp.floor(sp.re(v))


def f_trunc(v):
    return sp.sign(v) * sp.floor(sp.Abs(v))


def f_mod(a, b):
    return sp.Mod(a, b)


def f_gcd(*a):
    vals = _args_seq(a)
    out = vals[0]
    for v in vals[1:]:
        out = sp.gcd(out, v)
    return out


def f_lcm(*a):
    vals = _args_seq(a)
    out = vals[0]
    for v in vals[1:]:
        out = sp.lcm(out, v)
    return out


class Factored(sp.Basic):
    """An integer's factorisation, shown as 2^3·3^2·5."""

    def __new__(cls, n, factors):
        obj = sp.Basic.__new__(cls)
        obj._n = n
        obj._f = factors
        return obj

    def _latex(self, printer=None):
        if not self._f:
            return sp.latex(self._n)
        parts = [(f"{p}^{{{k}}}" if k > 1 else f"{p}") for p, k in sorted(self._f.items())]
        sign = "-" if self._n < 0 else ""
        return sign + r" \\cdot ".join(parts)

    def _sympystr(self, printer=None):
        parts = [(f"{p}^{k}" if k > 1 else f"{p}") for p, k in sorted(self._f.items())]
        return ("-" if self._n < 0 else "") + "*".join(parts)

    @property
    def value(self):
        return self._n


def f_factor(e, *gens, **kw):
    e = sp.sympify(e)
    if e.is_Integer:
        if e == 0 or abs(e) == 1:
            return e
        return Factored(e, sp.factorint(abs(e)))
    if e.is_Rational:
        return sp.Mul(f_factor(e.p), sp.Pow(f_factor(e.q), -1, evaluate=False), evaluate=False)
    return sp.factor(e, *gens, **kw)


def f_factorint(n):
    return f_factor(sp.Integer(n))


def f_perm(n, k):
    return sp.factorial(n) / sp.factorial(n - k)


def f_isprime(n):
    return sp.Integer(n).is_prime if sp.sympify(n).is_Integer else sp.false


def f_powmod(a, b, m):
    return sp.Integer(pow(int(a), int(b), int(m)))


def f_invmod(a, m):
    return sp.mod_inverse(a, m)


def f_digits(n, b=10):
    return sp.Matrix([sp.digits(int(n), int(b))[1:]])


def f_lambertw(v, k=0):
    return sp.LambertW(v, k)


def f_besselj(n, v):
    return sp.besselj(n, v)


def f_erfinv(v):
    return sp.erfinv(v)


def f_beta(a, b):
    return sp.beta(a, b)


def f_lgamma(v):
    return sp.loggamma(v)


def f_polar(r, theta):
    return r * sp.exp(sp.I * _to_rad(theta))


def f_arg(v):
    return _from_rad(sp.arg(v))


def f_cis(theta):
    return sp.exp(sp.I * _to_rad(theta))


def f_sign(v):
    return sp.sign(v)


def f_max(*a):
    return sp.Max(*_args_seq(a))


def f_min(*a):
    return sp.Min(*_args_seq(a))


def f_atan2(y, xv):
    return _from_rad(sp.atan2(y, xv))


# ---- bitwise (integers, decimal mode; the BASE mode has its own evaluator)

def _ints(*a):
    out = []
    for v in a:
        v = sp.sympify(v)
        if not v.is_Integer:
            raise CalcError("Bitwise operations need integers")
        out.append(int(v))
    return out


def f_band(a, b):
    x, y = _ints(a, b)
    return sp.Integer(x & y)


def f_bor(a, b):
    x, y = _ints(a, b)
    return sp.Integer(x | y)


def f_bxor(a, b):
    x, y = _ints(a, b)
    return sp.Integer(x ^ y)


def f_bnot(a, bits=64):
    x, n = _ints(a, bits)
    return sp.Integer(~x & ((1 << n) - 1))


def f_shl(a, n=1):
    x, k = _ints(a, n)
    return sp.Integer(x << k)


def f_shr(a, n=1):
    x, k = _ints(a, n)
    return sp.Integer(x >> k)


# ---- calculus

def _var_for(e, v=None):
    if v is not None:
        return v
    fs = sorted(sp.sympify(e).free_symbols, key=str) if isinstance(e, sp.Basic) else []
    if not fs:
        return x_
    for pref in ("x", "t", "y", "z"):
        for s in fs:
            if s.name == pref:
                return s
    return fs[0]


def f_diff(e, v=None, n=1, at=None):
    if isinstance(e, sp.Lambda):
        e = e(x_)
    v = _var_for(e, v)
    r = sp.diff(e, v, int(n))
    return r.subs(v, at) if at is not None else r


def f_nderiv(e, v, at, n=1):
    v = _var_for(e, v)
    f = sp.lambdify(v, e, "mpmath")
    return _with_dps(lambda: _float_result(mpmath.diff(f, _mpf(at), int(n))))


def _numeric_mode():
    return SETTINGS.get("number") == "decimal"


def f_nint(e, v=None, a=None, b=None):
    if a is None and b is None and isinstance(v, (sp.Tuple, tuple)):
        v, a, b = v
    v = _var_for(e, v)
    if a is None or b is None:
        raise CalcError("nint(f, x, a, b) needs the limits a and b")
    f = sp.lambdify(v, e, "mpmath")

    def run():
        lo = mpmath.mpf("-inf") if a == -sp.oo else mpmath.mpf("inf") if a == sp.oo else _mpf(a)
        hi = mpmath.mpf("-inf") if b == -sp.oo else mpmath.mpf("inf") if b == sp.oo else _mpf(b)
        return _float_result(mpmath.quad(f, [lo, hi]))
    return _with_dps(run)


def f_integrate(e, v=None, a=None, b=None):
    if isinstance(v, (sp.Tuple, tuple)) and a is None:
        v, a, b = v
    if isinstance(e, sp.Lambda):
        e = e(x_)
    v = _var_for(e, v)
    if a is None and b is None:
        r = sp.integrate(e, v)
        return r
    if _numeric_mode() and not (sp.sympify(e).free_symbols - {v}):
        return f_nint(e, v, a, b)
    r = sp.integrate(e, (v, a, b))
    if isinstance(r, sp.Integral) and not (r.free_symbols):
        return f_nint(e, v, a, b)
    return r


def f_limit(e, v=None, a=0, d="+-"):
    v = _var_for(e, v)
    d = str(d)
    return sp.limit(e, v, a, d if d in ("+", "-", "+-") else "+-")


def f_series(e, v=None, a=0, n=6):
    v = _var_for(e, v)
    return sp.series(e, v, a, int(n))


def f_taylor(e, v=None, a=0, n=6):
    v = _var_for(e, v)
    return sp.series(e, v, a, int(n)).removeO()


def f_sum(*a):
    if len(a) == 1:
        return sp.Add(*_seq(a[0]))
    if len(a) == 4:
        return sp.summation(a[0], (a[1], a[2], a[3]))
    if len(a) == 2 and isinstance(a[1], (sp.Tuple, tuple)):
        return sp.summation(a[0], tuple(a[1]))
    return sp.Add(*_args_seq(a))


def f_product(*a):
    if len(a) == 1:
        return sp.Mul(*_seq(a[0]))
    if len(a) == 4:
        return sp.product(a[0], (a[1], a[2], a[3]))
    return sp.Mul(*_args_seq(a))


def _eqs(e):
    out = []
    for item in _seq(e) if isinstance(e, (list, tuple, sp.MatrixBase, sp.Tuple)) else [e]:
        if isinstance(item, sp.Equality):
            out.append(item.lhs - item.rhs)
        else:
            out.append(sp.sympify(item))
    return out


class Solutions(sp.Basic):
    """Solutions of solve(): a list of values, or of {var: value} dicts."""

    def __new__(cls, sols, vars_):
        obj = sp.Basic.__new__(cls)
        obj.sols = sols
        obj.vars = vars_
        return obj

    def rows(self):
        out = []
        for s in self.sols:
            if isinstance(s, dict):
                out.append([(k, v) for k, v in s.items()])
            elif isinstance(s, (tuple, list)):
                out.append(list(zip(self.vars, s)))
            else:
                out.append([(self.vars[0] if self.vars else x_, s)])
        return out

    def _latex(self, printer=None):
        rows = self.rows()
        if not rows:
            return r"\\text{no solution}"
        parts = []
        for i, r in enumerate(rows):
            if len(rows) > 1 and len(r) == 1:
                k, v = r[0]
                parts.append(f"{sp.latex(k)}_{{{i + 1}}} = {sp.latex(v)}" if len(rows) > 1 else f"{sp.latex(k)} = {sp.latex(v)}")
            else:
                parts.append(r",\\; ".join(f"{sp.latex(k)} = {sp.latex(v)}" for k, v in r))
        return r"\\quad\\lor\\quad ".join(parts) if len(parts) <= 3 else r" \\\\ ".join(parts)

    def _sympystr(self, printer=None):
        rows = self.rows()
        if not rows:
            return "no solution"
        return " or ".join(", ".join(f"{k} = {v}" for k, v in r) for r in rows)

    def evalf(self, n=15, **kw):
        return Solutions([{k: sp.N(v, n) for k, v in r} for r in self.rows()], self.vars)

    def values(self):
        return [v for r in self.rows() for _, v in r]


def f_solve(eq, *vars_):
    eqs = _eqs(eq)
    vs = []
    for v in vars_:
        vs.extend(_seq(v))
    if not vs:
        fs = set()
        for e in eqs:
            fs |= e.free_symbols
        vs = sorted(fs, key=str)
        if len(eqs) == 1 and len(vs) > 1:
            vs = [_var_for(eqs[0])]
    if _numeric_mode() and len(eqs) == 1 and len(vs) == 1 and _is_poly(eqs[0], vs[0]):
        roots = sp.Poly(eqs[0], vs[0]).nroots(n=int(SETTINGS["digits"]) + 3)
        return Solutions(list(roots), vs)
    if len(eqs) == 1 and len(vs) == 1:
        sols = sp.solve(eqs[0], vs[0], dict=False)
        if not sols:
            ss = sp.solveset(eqs[0], vs[0], domain=sp.S.Complexes)
            if isinstance(ss, sp.FiniteSet):
                sols = list(ss)
            elif ss is not sp.S.EmptySet:
                return ss
        return Solutions(list(sols), vs)
    sols = sp.solve(eqs, vs, dict=True)
    return Solutions(sols, vs)


def _is_poly(e, v):
    try:
        sp.Poly(e, v)
        return True
    except Exception:
        return False


def f_nsolve(eq, v=None, x0=0, *rest):
    eqs = _eqs(eq)
    if len(eqs) == 1:
        v = _var_for(eqs[0], v if not isinstance(v, sp.MatrixBase) else None)
        f = sp.lambdify(v, eqs[0], "mpmath")
        return _with_dps(lambda: Solutions([_float_result(mpmath.findroot(f, _mpf(x0) if sp.sympify(x0).is_real else mpmath.mpc(complex(x0))))], [v]))
    vs = _seq(v)
    guesses = _seq(x0)
    if len(guesses) == 1:
        guesses = guesses * len(vs)

    def run():
        r = sp.nsolve(eqs, vs, guesses, prec=mpmath.mp.dps)
        return Solutions([tuple(r)], vs)
    return _with_dps(run)


def f_roots(p, v=None):
    if isinstance(p, sp.MatrixBase):  # coefficients, highest first
        coeffs = list(p)
        v = x_
        poly = sp.Poly(coeffs, v)
    else:
        if isinstance(p, sp.Equality):
            p = p.lhs - p.rhs
        v = _var_for(p, v)
        poly = sp.Poly(p, v)
    if _numeric_mode():
        return Solutions(poly.nroots(n=int(SETTINGS["digits"]) + 3), [v])
    rs = sp.roots(poly, multiple=True)
    if len(rs) < poly.degree():
        rs = [sp.CRootOf(poly, i) for i in range(poly.degree())]
    return Solutions(rs, [v])


def f_proots(coeffs):
    return f_roots(coeffs if isinstance(coeffs, sp.MatrixBase) else sp.Matrix(_seq(coeffs)))


def f_subs(e, *a):
    pairs = []
    i = 0
    while i < len(a):
        if isinstance(a[i], sp.Equality):
            pairs.append((a[i].lhs, a[i].rhs))
            i += 1
        else:
            pairs.append((a[i], a[i + 1]))
            i += 2
    return e.subs(pairs)


def f_apart(e, v=None):
    return sp.apart(e, _var_for(e, v))


def f_collect(e, v=None):
    return sp.collect(sp.expand(e), _var_for(e, v))


# ---- ODEs

class _Prime(sp.Function):
    """y' placeholders (f, k): replaced by Derivative(f(var), var, k) in dsolve."""
    nargs = 2

    def _latex(self, printer=None):
        return sp.latex(self.args[0]) + "'" * int(self.args[1])


class _PrimeAt(sp.Function):
    """y'(a) placeholders (f, k, a) in initial conditions."""
    nargs = 3

    def _latex(self, printer=None):
        return sp.latex(self.args[0]) + "'" * int(self.args[1]) + r"\\left(" + sp.latex(self.args[2]) + r"\\right)"


def _ode_var(eq, given):
    if given is not None and isinstance(given, sp.Symbol):
        return given
    fs = {s.name for s in eq.free_symbols}
    if "x" in fs:
        return x_
    if "t" in fs:
        return t_
    return x_


def f_dsolve(eq, *rest):
    eqs = _seq(eq) if isinstance(eq, (sp.MatrixBase, list, tuple)) else [eq]
    funcs, var, ics = [], None, []
    for r in rest:
        if isinstance(r, sp.Equality):
            ics.append(r)
        elif isinstance(r, sp.Symbol) and var is None and funcs:
            var = r
        elif isinstance(r, sp.Symbol):
            funcs.append(r)
        elif isinstance(r, sp.MatrixBase) or isinstance(r, (list, tuple)):
            for i in _seq(r):
                (ics if isinstance(i, sp.Equality) else funcs).append(i)
        elif isinstance(r, AppliedUndefLike()):
            funcs.append(sp.Symbol(r.func.__name__))
            if r.args and isinstance(r.args[0], sp.Symbol):
                var = r.args[0]
    names = set()
    for e in eqs:
        for p in e.atoms(_Prime):
            names.add(str(p.args[0]))
    for f in funcs:
        names.add(str(f))
    if not names:
        raise CalcError("dsolve needs a derivative, e.g. dsolve(y'' + y = 0)")
    probe = sp.Add(*[(e.lhs - e.rhs) if isinstance(e, sp.Equality) else e for e in eqs])
    var = var or _ode_var(probe, None)
    F = {n: sp.Function(n) for n in names}

    def fix(e):
        e = e.replace(lambda a: isinstance(a, _Prime), lambda a: sp.Derivative(F[str(a.args[0])](var), var, int(a.args[1])))
        e = e.subs({sp.Symbol(n): F[n](var) for n in names})
        e = e.replace(lambda a: isinstance(a, sp.Function) and type(a).__name__ in names and a.args != (var,) and len(a.args) == 1, lambda a: F[type(a).__name__](a.args[0]))
        return e
    eqs2 = [fix(e) for e in eqs]
    ic = {}
    for c in ics:
        lhs = c.lhs
        if isinstance(lhs, _PrimeAt):
            n, k, at = str(lhs.args[0]), int(lhs.args[1]), lhs.args[2]
            ic[sp.Derivative(F[n](var), var, k).subs(var, at)] = c.rhs
        else:
            lhs = fix(lhs)
            ic[lhs] = c.rhs
    target = [F[n](var) for n in sorted(names)]
    r = sp.dsolve(eqs2 if len(eqs2) > 1 else eqs2[0], target if len(target) > 1 else target[0], ics=ic or None)
    return r


def AppliedUndefLike():
    from sympy.core.function import AppliedUndef
    return AppliedUndef


def f_odesolve(f, tv, yv, t0, y0, t1):
    """y' = f(t, y), y(t0) = y0: y(t1). Scalar: mpmath (full precision); vector: SciPy."""
    if isinstance(y0, sp.MatrixBase) or isinstance(yv, sp.MatrixBase):
        import numpy as np
        from scipy.integrate import solve_ivp
        ys = _seq(yv)
        fs = _seq(f)
        fn = sp.lambdify([tv, ys], fs, "numpy")
        sol = solve_ivp(lambda t, y: np.asarray(fn(t, list(y)), dtype=float), (float(t0), float(t1)),
                        [float(v) for v in _seq(y0)], rtol=1e-11, atol=1e-13)
        if not sol.success:
            raise CalcError(sol.message)
        return sp.Matrix([sp.Float(v, 15) for v in sol.y[:, -1]])
    fn = sp.lambdify((tv, yv), f, "mpmath")

    def run():
        sol = mpmath.odefun(fn, _mpf(t0), _mpf(y0))
        return _float_result(sol(_mpf(t1)))
    return _with_dps(run)


# ---- linear algebra

def _M(v):
    if isinstance(v, sp.MatrixBase):
        return v
    if isinstance(v, (list, tuple)):
        return to_matrix(list(v))
    raise CalcError("Expected a matrix or vector")


def to_matrix(rows):
    """[[1,2],[3,4]] -> Matrix; [1,2,3] -> a column vector. Lists of equations stay lists."""
    flat = []

    def walk(r):
        for i in r:
            if isinstance(i, (list, tuple)):
                walk(i)
            else:
                flat.append(i)
    walk(rows)
    if any(not isinstance(sp.sympify(i), sp.Expr) for i in flat if not isinstance(i, sp.MatrixBase)):
        return sp.Tuple(*rows) if not any(isinstance(i, list) for i in rows) else rows
    if rows and all(isinstance(r, (list, tuple)) for r in rows):
        n = len(rows[0])
        if any(len(r) != n for r in rows):
            raise CalcError("Every row of a matrix needs the same number of entries")
        return sp.Matrix(rows)
    if rows and all(isinstance(r, sp.MatrixBase) for r in rows):
        return sp.Matrix.hstack(*rows) if all(r.cols == 1 for r in rows) and False else sp.Matrix.vstack(*[r.T if r.cols == 1 else r for r in rows])
    return sp.Matrix(rows)


class Labeled(sp.Basic):
    """Several named results: L, U, P = lu(A)."""

    def __new__(cls, items):
        obj = sp.Basic.__new__(cls)
        obj.items = items
        return obj

    def _latex(self, printer=None):
        return r",\\quad ".join(f"{k} = {sp.latex(v)}" for k, v in self.items)

    def _sympystr(self, printer=None):
        return ", ".join(f"{k} = {_text(v)}" for k, v in self.items)

    def evalf(self, n=15, **kw):
        return Labeled([(k, sp.N(v, n) if isinstance(v, sp.Basic) else v) for k, v in self.items])


def _is_float_matrix(A):
    return any(isinstance(e, sp.Float) for e in A)


def f_det(A):
    return _M(A).det()


def f_inv(A):
    A = _M(A)
    if A.det() == 0:
        raise CalcError("The matrix is singular (det = 0)")
    return A.inv()


def f_transpose(A):
    return _M(A).T


def f_rank(A):
    return sp.Integer(_M(A).rank())


def f_rref(A):
    return _M(A).rref()[0]


def f_trace(A):
    return _M(A).trace()


def f_eigenvals(A):
    A = _M(A)
    if _numeric_mode() or _is_float_matrix(A):
        def run():
            ev, _ = mpmath.eig(mpmath.matrix(A.evalf(mpmath.mp.dps).tolist()))
            return sp.Matrix([_float_result(v) for v in ev])
        return _with_dps(run)
    vals = A.eigenvals()
    out = []
    for v, m in vals.items():
        out.extend([v] * m)
    return sp.Matrix(out)


def f_eigenvects(A):
    A = _M(A)
    if _numeric_mode() or _is_float_matrix(A):
        def run():
            ev, er = mpmath.eig(mpmath.matrix(A.evalf(mpmath.mp.dps).tolist()))
            items = []
            for i, v in enumerate(ev):
                vec = sp.Matrix([_float_result(er[j, i]) for j in range(A.rows)])
                items.append((f"\\\\lambda_{{{i + 1}}} = {sp.latex(_float_result(v))},\\\\ v_{{{i + 1}}}", vec))
            return Labeled(items)
        return _with_dps(run)
    items = []
    k = 1
    for val, mult, vecs in A.eigenvects():
        for vec in vecs:
            items.append((f"\\\\lambda_{{{k}}} = {sp.latex(val)},\\\\ v_{{{k}}}", vec))
            k += 1
    return Labeled(items)


def f_lu(A):
    A = _M(A)
    L, Uu, perm = A.LUdecomposition()
    P = sp.eye(A.rows).permute_rows(perm) if perm else sp.eye(A.rows)
    return Labeled([("P", P), ("L", L), ("U", Uu)])


def f_qr(A):
    A = _M(A)
    if _numeric_mode() or _is_float_matrix(A):
        def run():
            Q, R = mpmath.qr(mpmath.matrix(A.evalf(mpmath.mp.dps).tolist()))
            return Labeled([("Q", _from_mp(Q)), ("R", _from_mp(R))])
        return _with_dps(run)
    Q, R = A.QRdecomposition()
    return Labeled([("Q", Q), ("R", R)])


def _from_mp(M):
    return sp.Matrix(M.rows, M.cols, lambda i, j: _float_result(M[i, j]))


def f_svd(A):
    A = _M(A)

    def run():
        Uu, S, V = mpmath.svd(mpmath.matrix(A.evalf(mpmath.mp.dps).tolist()))
        return Labeled([("U", _from_mp(Uu)), ("\\\\Sigma", sp.diag(*[_float_result(s) for s in S])), ("V^T", _from_mp(V))])
    if not _numeric_mode() and not _is_float_matrix(A) and A.rows * A.cols <= 9:
        try:
            Uu, S, V = A.singular_value_decomposition()
            return Labeled([("U", sp.simplify(Uu)), ("\\\\Sigma", sp.simplify(S)), ("V^T", sp.simplify(V.T))])
        except Exception:
            pass
    return _with_dps(run)


def f_cholesky(A):
    return _M(A).cholesky(hermitian=True)


def f_norm(A, p=2):
    A = _M(A)
    if str(p) in ("oo", "inf"):
        p = sp.oo
    return A.norm(p if p != "fro" else None)


def f_cond(A):
    A = _M(A)
    return _with_dps(lambda: _float_result(mpmath.cond(mpmath.matrix(A.evalf(mpmath.mp.dps).tolist()), mpmath.norm)))


def f_cross(a, b):
    return _M(a).cross(_M(b)) if _M(a).shape == _M(b).shape else _M(a).reshape(3, 1).cross(_M(b).reshape(3, 1))


def f_dot(a, b):
    a, b = _M(a), _M(b)
    return sum((x * y for x, y in zip(a, b)), sp.Integer(0))


def f_linsolve(A, b):
    A, b = _M(A), _M(b)
    if b.cols != 1 and b.rows == 1:
        b = b.T
    if A.rows == A.cols and A.det() != 0:
        return A.LUsolve(b)
    sol, params = A.gauss_jordan_solve(b)
    return sol


def f_lstsq(A, b):
    A, b = _M(A), _M(b)
    return (A.T * A).inv() * A.T * b


def f_eye(n, m=None):
    return sp.eye(int(n), int(m) if m is not None else int(n))


def f_zeros(n, m=None):
    return sp.zeros(int(n), int(m) if m is not None else int(n))


def f_ones(n, m=None):
    return sp.ones(int(n), int(m) if m is not None else int(n))


def f_diag(*a):
    return sp.diag(*_args_seq(a))


def f_adj(A):
    return _M(A).adjugate()


def f_charpoly(A, lam=None):
    lam = lam or sp.Symbol("lamda")
    return _M(A).charpoly(lam).as_expr()


def f_expm(A):
    return _M(A).exp()


def f_kron(a, b):
    from sympy.physics.quantum import TensorProduct
    return TensorProduct(_M(a), _M(b))


def f_nullspace(A):
    ns = _M(A).nullspace()
    return sp.Matrix.hstack(*ns) if ns else sp.zeros(_M(A).cols, 1)


def f_dim(A):
    A = _M(A)
    return sp.Matrix([[A.rows, A.cols]])


# ---- statistics on lists

def _vals(*a):
    vs = [sp.sympify(v) for v in _args_seq(a)]
    if not vs:
        raise CalcError("Empty list")
    return vs


def f_mean(*a):
    vs = _vals(*a)
    return sp.Add(*vs) / len(vs)


def f_median(*a):
    vs = sorted(_vals(*a), key=lambda v: float(sp.N(v)))
    n = len(vs)
    return vs[n // 2] if n % 2 else (vs[n // 2 - 1] + vs[n // 2]) / 2


def f_var(*a):
    vs = _vals(*a)
    if len(vs) < 2:
        raise CalcError("The sample variance needs two values or more")
    m = sp.Add(*vs) / len(vs)
    return sp.Add(*[(v - m) ** 2 for v in vs]) / (len(vs) - 1)


def f_pvar(*a):
    vs = _vals(*a)
    m = sp.Add(*vs) / len(vs)
    return sp.Add(*[(v - m) ** 2 for v in vs]) / len(vs)


def f_stdev(*a):
    return sp.sqrt(f_var(*a))


def f_pstdev(*a):
    return sp.sqrt(f_pvar(*a))


def f_mode(*a):
    vs = _vals(*a)
    counts = {}
    for v in vs:
        counts[v] = counts.get(v, 0) + 1
    top = max(counts.values())
    return sp.Matrix([v for v, c in counts.items() if c == top])


def f_quantile(data, q):
    import numpy as np
    vs = [float(sp.N(v)) for v in _seq(data)]
    return sp.Float(float(np.quantile(vs, float(q))), 15)


def f_cov(a, b):
    xs, ys = _vals(a), _vals(b)
    mx, my = sp.Add(*xs) / len(xs), sp.Add(*ys) / len(ys)
    return sp.Add(*[(x - mx) * (y - my) for x, y in zip(xs, ys)]) / (len(xs) - 1)


def f_corr(a, b):
    return f_cov(a, b) / (f_stdev(a) * f_stdev(b))


# ---- distributions (exact where SymPy can, SciPy otherwise)

def _sp_float(v):
    return sp.Float(float(v), 15)


def _scipy_stats():
    import scipy.stats as st
    return st


def normpdf(xv, mu=0, s=1):
    return sp.exp(-((xv - mu) ** 2) / (2 * s**2)) / (s * sp.sqrt(2 * sp.pi))


def normcdf(xv, mu=0, s=1, upper=None):
    """normcdf(x) = P(X <= x); normcdf(a, b, mu, s) = P(a <= X <= b) when given 4 values."""
    if upper is not None:  # (a, b, mu, s)
        a, b, m, sd = xv, mu, s, upper
        return normcdf(b, m, sd) - normcdf(a, m, sd)
    return (1 + sp.erf((xv - mu) / (s * sp.sqrt(2)))) / 2


def invnorm(p, mu=0, s=1):
    return mu + s * sp.sqrt(2) * sp.erfinv(2 * p - 1)


def tpdf(xv, df):
    return _sp_float(_scipy_stats().t.pdf(float(xv), float(df)))


def tcdf(xv, df):
    return _sp_float(_scipy_stats().t.cdf(float(xv), float(df)))


def invt(p, df):
    return _sp_float(_scipy_stats().t.ppf(float(p), float(df)))


def chi2pdf(xv, k):
    return _sp_float(_scipy_stats().chi2.pdf(float(xv), float(k)))


def chi2cdf(xv, k):
    return _sp_float(_scipy_stats().chi2.cdf(float(xv), float(k)))


def invchi2(p, k):
    return _sp_float(_scipy_stats().chi2.ppf(float(p), float(k)))


def fpdf(xv, d1, d2):
    return _sp_float(_scipy_stats().f.pdf(float(xv), float(d1), float(d2)))


def fcdf(xv, d1, d2):
    return _sp_float(_scipy_stats().f.cdf(float(xv), float(d1), float(d2)))


def invf(p, d1, d2):
    return _sp_float(_scipy_stats().f.ppf(float(p), float(d1), float(d2)))


def binompdf(k, n, p):
    return sp.binomial(n, k) * p**k * (1 - p) ** (n - k)


def binomcdf(k, n, p):
    k = int(sp.floor(k))
    return sp.Add(*[binompdf(sp.Integer(i), n, p) for i in range(0, k + 1)])


def poisspdf(k, lam):
    return lam**k * sp.exp(-lam) / sp.factorial(k)


def poisscdf(k, lam):
    k = int(sp.floor(k))
    return sp.Add(*[poisspdf(sp.Integer(i), lam) for i in range(0, k + 1)])


def geompdf(k, p):
    return (1 - p) ** (k - 1) * p


def geomcdf(k, p):
    return 1 - (1 - p) ** sp.floor(k)


def exppdf(xv, lam):
    return lam * sp.exp(-lam * xv) if xv >= 0 else sp.Integer(0)


def expcdf(xv, lam):
    return 1 - sp.exp(-lam * xv) if xv >= 0 else sp.Integer(0)


def unifpdf(xv, a, b):
    return 1 / (b - a) if a <= xv <= b else sp.Integer(0)


def unifcdf(xv, a, b):
    return sp.Integer(0) if xv < a else sp.Integer(1) if xv > b else (xv - a) / (b - a)


# ---- misc

def f_convert(e, target, to=None):
    if to is not None:  # convert(20, "degC", "K") / convert(3, km, mi)
        return convert_value(e, str(target).strip('"'), str(to).strip('"'))
    return convert_units(e, target)


def f_const(name):
    return constant(str(name))


def f_approx(e, n=None):
    return sp.N(e, int(n) if n is not None else int(SETTINGS["digits"]))


def f_exact(e):
    return sp.nsimplify(e, rational=False)


def f_tofrac(e, maxden=10**6):
    v = sp.N(e, 30)
    from fractions import Fraction
    return sp.Rational(Fraction(str(v)).limit_denominator(int(maxden)))


# ------------------------------------------------------------- namespace

def _trig_ns():
    ns = {}
    for n, f in (("sin", sp.sin), ("cos", sp.cos), ("tan", sp.tan), ("sec", sp.sec), ("csc", sp.csc), ("cot", sp.cot)):
        ns[n] = _fwd(f) if SETTINGS["angle"] != "rad" else f
    for n, f in (("asin", sp.asin), ("acos", sp.acos), ("atan", sp.atan), ("asec", sp.asec), ("acsc", sp.acsc), ("acot", sp.acot)):
        g = _inv(f) if SETTINGS["angle"] != "rad" else f
        ns[n] = g
        ns["arc" + n[1:]] = g
    ns["atan2"] = f_atan2
    ns["_DEG_"] = 1 / _angle_factor() * sp.pi / 180 if SETTINGS["angle"] != "deg" else sp.Integer(1)
    if SETTINGS["angle"] == "rad":
        ns["_DEG_"] = sp.pi / 180
    elif SETTINGS["angle"] == "grad":
        ns["_DEG_"] = sp.Rational(10, 9)
    return ns


BASE_NS = {
    # constants
    "pi": sp.pi, "e": sp.E, "E": sp.E, "i": sp.I, "I": sp.I, "oo": sp.oo, "inf": sp.oo, "infinity": sp.oo,
    "phi": sp.GoldenRatio, "euler_gamma": sp.EulerGamma, "catalan": sp.Catalan, "true": sp.true, "false": sp.false,
    # elementary
    "sqrt": sp.sqrt, "cbrt": lambda v: sp.real_root(v, 3), "root": f_root, "nthroot": f_root, "exp": sp.exp, "ln": sp.log,
    "log": f_log, "log10": lambda v: sp.log(v, 10), "log2": lambda v: sp.log(v, 2), "lg": lambda v: sp.log(v, 10),
    "abs": sp.Abs, "sign": f_sign, "sgn": f_sign, "floor": sp.floor, "ceil": sp.ceiling, "ceiling": sp.ceiling,
    "round": f_round, "trunc": f_trunc, "ipart": f_trunc, "frac": f_frac, "fpart": f_frac, "mod": f_mod,
    "max": f_max, "min": f_min,
    "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh, "sech": sp.sech, "csch": sp.csch, "coth": sp.coth,
    "asinh": sp.asinh, "acosh": sp.acosh, "atanh": sp.atanh, "asech": sp.asech, "acsch": sp.acsch, "acoth": sp.acoth,
    "arcsinh": sp.asinh, "arccosh": sp.acosh, "arctanh": sp.atanh, "sinc": sp.sinc,
    # complex
    "re": sp.re, "im": sp.im, "arg": f_arg, "angle": f_arg, "conj": sp.conjugate, "conjugate": sp.conjugate,
    "polar": f_polar, "cis": f_cis,
    # special functions
    "gamma": sp.gamma, "lgamma": f_lgamma, "loggamma": sp.loggamma, "digamma": sp.digamma, "polygamma": sp.polygamma,
    "beta": f_beta, "lowergamma": sp.lowergamma, "uppergamma": sp.uppergamma, "erf": sp.erf, "erfc": sp.erfc,
    "erfi": sp.erfi, "erfinv": f_erfinv, "erfcinv": sp.erfcinv, "besselj": f_besselj, "bessely": sp.bessely,
    "besseli": sp.besseli, "besselk": sp.besselk, "jn": sp.jn, "yn": sp.yn, "hankel1": sp.hankel1, "hankel2": sp.hankel2,
    "airyai": sp.airyai, "airybi": sp.airybi, "airyaiprime": sp.airyaiprime, "airybiprime": sp.airybiprime,
    "zeta": sp.zeta, "eta": sp.dirichlet_eta, "polylog": sp.polylog, "lambertw": f_lambertw, "LambertW": f_lambertw, "W": f_lambertw,
    "legendre": sp.legendre, "assoc_legendre": sp.assoc_legendre, "hermite": sp.hermite, "laguerre": sp.laguerre,
    "assoc_laguerre": sp.assoc_laguerre, "chebyshevt": sp.chebyshevt, "chebyshevu": sp.chebyshevu, "jacobi": sp.jacobi,
    "gegenbauer": sp.gegenbauer, "Ynm": sp.Ynm, "Ei": sp.Ei, "li": sp.li, "Si": sp.Si, "Ci": sp.Ci, "Shi": sp.Shi,
    "Chi": sp.Chi, "fresnels": sp.fresnels, "fresnelc": sp.fresnelc, "ellipk": sp.elliptic_k, "ellipe": sp.elliptic_e,
    "ellipf": sp.elliptic_f, "ellippi": sp.elliptic_pi, "hyper": sp.hyper, "heaviside": sp.Heaviside,
    "dirac": sp.DiracDelta, "kronecker": sp.KroneckerDelta,
    # combinatorics & number theory
    "factorial": sp.factorial, "factorial2": sp.factorial2, "binomial": sp.binomial, "nCr": sp.binomial, "comb": sp.binomial,
    "nPr": f_perm, "perm": f_perm, "gcd": f_gcd, "lcm": f_lcm, "isprime": f_isprime, "nextprime": sp.nextprime,
    "prevprime": sp.prevprime, "prime": sp.prime, "primepi": sp.primepi, "factorint": f_factorint, "divisors": lambda n: sp.Matrix([sp.divisors(n)]),
    "totient": sp.totient, "phi_euler": sp.totient, "mobius": sp.mobius, "powmod": f_powmod, "invmod": f_invmod,
    "fibonacci": sp.fibonacci, "lucas": sp.lucas, "catalan_number": sp.catalan, "bernoulli": sp.bernoulli,
    "euler_number": sp.euler, "bell": sp.bell, "partition": sp.partition, "stirling": lambda n, k: sp.functions.combinatorial.numbers.stirling(n, k),
    "digits": f_digits,
    "band": f_band, "bor": f_bor, "bxor": f_bxor, "bnot": f_bnot, "shl": f_shl, "shr": f_shr,
    # algebra & calculus
    "simplify": sp.simplify, "expand": sp.expand, "factor": f_factor, "apart": f_apart, "together": sp.together,
    "cancel": sp.cancel, "collect": f_collect, "trigsimp": sp.trigsimp, "expand_trig": sp.expand_trig,
    "expand_log": lambda e: sp.expand_log(e, force=True), "logcombine": lambda e: sp.logcombine(e, force=True),
    "powsimp": sp.powsimp, "radsimp": sp.radsimp, "nsimplify": sp.nsimplify, "rewrite": lambda e, f: e.rewrite(f),
    "numer": sp.numer, "denom": sp.denom, "degree": sp.degree, "coeffs": lambda p, v=None: sp.Matrix([sp.Poly(p, _var_for(p, v)).all_coeffs()]),
    "quo": lambda a, b: sp.quo(a, b), "rem": lambda a, b: sp.rem(a, b), "subs": f_subs,
    "diff": f_diff, "derivative": f_diff, "nderiv": f_nderiv, "integrate": f_integrate, "int": f_integrate,
    "integral": f_integrate, "nint": f_nint, "quad": f_nint, "limit": f_limit, "lim": f_limit, "series": f_series,
    "taylor": f_taylor, "sum": f_sum, "summation": f_sum, "product": f_product, "prod": f_product,
    "solve": f_solve, "nsolve": f_nsolve, "fsolve": f_nsolve, "roots": f_roots, "proots": f_proots, "dsolve": f_dsolve,
    "odesolve": f_odesolve, "Eq": sp.Eq,
    # linear algebra
    "det": f_det, "inv": f_inv, "inverse": f_inv, "transpose": f_transpose, "trn": f_transpose, "rank": f_rank,
    "rref": f_rref, "trace": f_trace, "tr": f_trace, "eigenvals": f_eigenvals, "eigvals": f_eigenvals, "eig": f_eigenvects,
    "eigenvects": f_eigenvects, "lu": f_lu, "qr": f_qr, "svd": f_svd, "cholesky": f_cholesky, "norm": f_norm,
    "cond": f_cond, "cross": f_cross, "dot": f_dot, "linsolve": f_linsolve, "lstsq": f_lstsq, "eye": f_eye,
    "identity": f_eye, "zeros": f_zeros, "ones": f_ones, "diag": f_diag, "adj": f_adj, "charpoly": f_charpoly,
    "expm": f_expm, "kron": f_kron, "nullspace": f_nullspace, "kernel": f_nullspace, "dim": f_dim, "Matrix": sp.Matrix,
    # statistics
    "mean": f_mean, "median": f_median, "var": f_var, "pvar": f_pvar, "stdev": f_stdev, "std": f_stdev,
    "pstdev": f_pstdev, "mode": f_mode, "quantile": f_quantile, "cov": f_cov, "corr": f_corr,
    "normpdf": normpdf, "normcdf": normcdf, "invnorm": invnorm, "tpdf": tpdf, "tcdf": tcdf, "invt": invt,
    "chi2pdf": chi2pdf, "chi2cdf": chi2cdf, "invchi2": invchi2, "fpdf": fpdf, "fcdf": fcdf, "invf": invf,
    "binompdf": binompdf, "binomcdf": binomcdf, "poisspdf": poisspdf, "poisscdf": poisscdf, "geompdf": geompdf,
    "geomcdf": geomcdf, "exppdf": exppdf, "expcdf": expcdf, "unifpdf": unifpdf, "unifcdf": unifcdf,
    # units, constants, numbers
    "convert": f_convert, "const": f_const, "approx": f_approx, "N": f_approx, "exact": f_exact, "tofrac": f_tofrac,
    # internals used by the preprocessor
    "_M_": lambda rows: to_matrix(rows), "_polar_": f_polar, "_DER_": _Prime, "_DAT_": _PrimeAt,
}


def function_names():
    return sorted(k for k in {**BASE_NS, **_trig_ns()} if not k.startswith("_"))


# ------------------------------------------------------------ preprocessing

_IDENT = re.compile(r"[A-Za-z_À-ɏͰ-Ͽ][A-Za-z0-9_À-ɏͰ-Ͽ]*")
_SIMPLE = {
    "×": "*", "·": "*", "÷": "/", "−": "-", "–": "-", "π": "pi", "∞": "oo", "≤": "<=", "≥": ">=", "≠": "!=",
    "²": "**2", "³": "**3", "⁻¹": "**(-1)", "ℯ": "E", "ⅈ": "I", "λ": "lamda", "→": "▶", "⇒": "▶",
}


def _match_paren(s, i):
    """Index of the bracket closing the one at s[i]."""
    pairs = {"(": ")", "[": "]", "{": "}"}
    open_, close = s[i], pairs[s[i]]
    depth = 0
    j = i
    while j < len(s):
        c = s[j]
        if c == open_:
            depth += 1
        elif c == close:
            depth -= 1
            if depth == 0:
                return j
        j += 1
    raise CalcError(f"Missing '{close}'")


def _operand_right(s, i):
    """The operand starting at s[i]: a signed number, a name with its call, or a bracketed group (with ° kept)."""
    j = i
    while j < len(s) and s[j] == " ":
        j += 1
    k = j
    if k < len(s) and s[k] in "+-":
        k += 1
    if k < len(s) and s[k] == "(":
        k = _match_paren(s, k) + 1
    else:
        m = re.match(r"[0-9.]+(?:[eE][+-]?\\d+)?|[A-Za-z_][A-Za-z0-9_]*", s[k:])
        if not m:
            raise CalcError("∠ needs an angle after it")
        k += m.end()
        if k < len(s) and s[k] == "(":
            k = _match_paren(s, k) + 1
    if k < len(s) and s[k] == "°":
        k += 1
    return j, k


def _operand_left(s, i):
    """The operand ending just before s[i]."""
    k = i
    while k > 0 and s[k - 1] == " ":
        k -= 1
    end = k
    if k > 0 and s[k - 1] == ")":
        depth = 0
        j = k - 1
        while j >= 0:
            if s[j] == ")":
                depth += 1
            elif s[j] == "(":
                depth -= 1
                if depth == 0:
                    break
            j -= 1
        k = j
        while k > 0 and (s[k - 1].isalnum() or s[k - 1] == "_"):
            k -= 1
    else:
        while k > 0 and (s[k - 1].isalnum() or s[k - 1] in "._"):
            k -= 1
    if k == end:
        raise CalcError("∠ needs a modulus before it")
    return k, end


def _polar_pass(s):
    while "∠" in s:
        i = s.index("∠")
        a, b = _operand_left(s, i)
        c, d = _operand_right(s, i + 1)
        s = s[:a] + f"_polar_({s[a:b]}, {s[c:d]})" + s[d:]
    return s


def _fix_equals(s):
    """a = b -> Eq(a, b), argument by argument, at every bracket level."""
    out, i = _eq_level(s, 0, None)
    return out


def _eq_level(s, i, closer):
    args, cur = [], []
    while i < len(s):
        c = s[i]
        if c in "([{":
            inner, i = _eq_level(s, i + 1, {"(": ")", "[": "]", "{": "}"}[c])
            cur.append(c + inner + {"(": ")", "[": "]", "{": "}"}[c])
            continue
        if c == closer:
            args.append("".join(cur))
            return ",".join(_eq_arg(a) for a in args), i + 1
        if c == "," and closer is not None:
            args.append("".join(cur))
            cur = []
            i += 1
            continue
        if c in "\\"'":
            j = s.index(c, i + 1) if c in s[i + 1:] else len(s) - 1
            cur.append(s[i:j + 1])
            i = j + 1
            continue
        cur.append(c)
        i += 1
    args.append("".join(cur))
    return ",".join(_eq_arg(a) for a in args), i


_EQ = re.compile(r"(?<![=<>!:])=(?!=)")


def _eq_arg(a):
    parts = _EQ.split(a)
    if len(parts) == 2:
        return f"Eq({parts[0]}, {parts[1]})"
    if len(parts) > 2:
        raise CalcError("Only one '=' per equation")
    return a


INTERNAL = {"_M_", "_polar_", "_DER_", "_DAT_", "_DEG_"}


def preprocess(src, ctx):
    s = src
    for k, v in _SIMPLE.items():
        s = s.replace(k, v)
    s = s.replace("°C", " _degC").replace("°F", " _degF")
    s = _polar_pass(s)
    out = []
    i, n = 0, len(s)
    brackets = []
    prime_names = set(re.findall(r"([A-Za-z]\\w*)'", s))
    while i < n:
        c = s[i]
        prev = out[-1][-1] if out and out[-1] else ""
        # strings
        if c in "\\"'" and not (prev and (prev.isalnum() or prev == "_" or prev == "'")):
            j = s.find(c, i + 1)
            if j < 0:
                raise CalcError("Missing closing quote")
            out.append(s[i:j + 1])
            i = j + 1
            continue
        # √x, ∛x
        if c in "√∛":
            fn = "sqrt" if c == "√" else "cbrt"
            j = i + 1
            if j < n and s[j] == "(":
                out.append(fn)
                i = j
                continue
            m = re.match(r"[0-9.]+|[A-Za-z_]\\w*", s[j:])
            if not m:
                raise CalcError(f"{c} needs a value")
            out.append(f"{fn}({m.group(0)})")
            i = j + m.end()
            continue
        if c == "°":
            out.append("*_DEG_")
            i += 1
            continue
        # constants #c, #hbar
        if c == "#":
            m = _IDENT.match(s, i + 1)
            if not m:
                raise CalcError("# needs a constant name, e.g. #c")
            name = m.group(0)
            ctx.setdefault("consts", set()).add(name)
            out.append(("*" if prev.isdigit() or prev == ")" else "") + f"_K_{name}")
            i = m.end()
            continue
        # numbers (0x, 0b, 0o literals)
        if c.isdigit() and not (prev and (prev.isalnum() or prev == "_")):
            m = re.match(r"0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+", s[i:])
            if m:
                out.append(str(int(m.group(0).replace("_", ""), 0)))
                i += m.end()
                continue
            m = re.match(r"\\d(?:_?\\d)*(\\.\\d*)?([eE][+-]?\\d+)?|\\.\\d+([eE][+-]?\\d+)?", s[i:])
            tok = m.group(0)
            out.append(tok)
            i += m.end()
            if i < n and s[i] == "_" and i + 1 < n and not s[i + 1].isdigit():
                out.append(" ")
            continue
        # identifiers: units (_m), primes (y''), function applications of ODE unknowns
        m = _IDENT.match(s, i)
        if m:
            name = m.group(0)
            j = m.end()
            if name.startswith("_") and name not in INTERNAL and not name.startswith(("_K_", "_F_", "_U_")):
                if name[1:] in ("degC", "degF", "degR"):
                    out.append(f"_U_{name[1:]}")
                else:
                    lookup_unit(name[1:])  # unknown units fail early with a clear message
                    ctx.setdefault("units", set()).add(name[1:])
                    out.append(f"_U_{name[1:]}")
                i = j
                continue
            k = j
            while k < n and s[k] == "'":
                k += 1
            if k > j:
                order = k - j
                if k < n and s[k] == "(":
                    e = _match_paren(s, k)
                    out.append(f"_DAT_({name}, {order}, ({s[k + 1:e]}))")
                    i = e + 1
                else:
                    out.append(f"_DER_({name}, {order})")
                    i = k
                continue
            if name in prime_names and j < n and s[j] == "(":
                ctx.setdefault("odefuncs", set()).add(name)
                out.append(f"_F_{name}")
                i = j
                continue
            out.append(name)
            i = j
            continue
        if c == "[":
            p = "".join(out).rstrip()[-1:] if out else ""
            if p and (p.isalnum() or p in "_)]"):
                brackets.append("idx")
                out.append("[")
            elif brackets and brackets[-1] in ("mat", "row"):
                brackets.append("row")
                out.append("[")
            else:
                brackets.append("mat")
                out.append("_M_([")
            i += 1
            continue
        if c == "]":
            kind = brackets.pop() if brackets else "idx"
            out.append("])" if kind == "mat" else "]")
            i += 1
            continue
        out.append(c)
        i += 1
    s = "".join(out)
    _check_brackets(s)
    s = _fix_equals(s)
    return s


def _check_brackets(s):
    stack = []
    quote = None
    for c in s:
        if quote:
            if c == quote:
                quote = None
            continue
        if c in "\\"'" and False:
            quote = c
        if c in "([{":
            stack.append(c)
        elif c in ")]}":
            if not stack or {"(": ")", "[": "]", "{": "}"}[stack.pop()] != c:
                raise CalcError(f"'{c}' has no opening bracket")
    if stack:
        raise CalcError("Missing '" + {"(": ")", "[": "]", "{": "}"}[stack[-1]] + "'")


# ------------------------------------------------------------------ parsing

def _local_dict(ctx, ans_ids, preview=False):
    ld = dict(BASE_NS)
    ld.update(_trig_ns())
    if preview:
        # Show what was typed: no heavy work, names stay names.
        for name in ("integrate", "int", "integral", "nint", "quad"):
            ld[name] = _show_integral
        for name in ("diff", "derivative"):
            ld[name] = _show_diff
        for name in ("sum", "summation"):
            ld[name] = _show_sum
        for name in ("product", "prod"):
            ld[name] = _show_product
        for name in ("limit", "lim"):
            ld[name] = _show_limit
        for name in ("sin", "cos", "tan", "sec", "csc", "cot"):
            ld[name] = getattr(sp, name)
        for name in ("asin", "acos", "atan", "asec", "acsc", "acot"):
            ld[name] = getattr(sp, name)
            ld["arc" + name[1:]] = getattr(sp, name)
        heavy = ("solve", "nsolve", "fsolve", "roots", "proots", "dsolve", "odesolve", "simplify", "expand", "factor",
                 "apart", "together", "cancel", "collect", "trigsimp", "expand_trig", "series", "taylor", "det", "inv",
                 "inverse", "rref", "rank", "eigenvals", "eigvals", "eig", "eigenvects", "lu", "qr", "svd", "cholesky",
                 "norm", "cond", "linsolve", "lstsq", "expm", "nullspace", "kernel", "charpoly", "adj", "factorint",
                 "divisors", "convert", "subs", "nderiv", "mean", "median", "var", "stdev", "mode", "quantile",
                 "cov", "corr", "binomcdf", "poisscdf", "prime", "nextprime", "prevprime", "isprime", "totient",
                 "transpose", "trn", "trace", "tr", "cross", "dot", "dim", "approx", "N", "exact", "tofrac",
                 "factorial2", "lowergamma", "uppergamma", "ln", "log10", "log2", "lg", "nCr", "nPr", "perm", "comb", "mod",
                 "gcd", "lcm", "powmod", "invmod", "polar", "cis", "arg", "angle", "max", "min", "round", "trunc", "ipart",
                 "frac", "fpart", "ceil", "sign", "sgn", "cbrt", "root", "nthroot", "lgamma", "erfinv", "lambertw", "W",
                 "fibonacci", "band", "bor", "bxor", "bnot", "shl", "shr", "digits")
        for name in heavy:
            ld[name] = sp.Function(name)
        ld["log"] = lambda v, b=None, **kw: sp.Function("log")(v) if b is None else sp.log(v, b, **kw)
    for name in ctx.get("units", ()):
        ld[f"_U_{name}"] = lookup_unit(name)
    for name in ("degC", "degF", "degR"):
        ld[f"_U_{name}"] = sp.Symbol({"degC": "°C", "degF": "°F", "degR": "°R"}[name])
    for name in ctx.get("consts", ()):
        ld[f"_K_{name}"] = sp.Symbol(name) if preview else constant(name)
    for name in ctx.get("odefuncs", ()):
        ld[f"_F_{name}"] = sp.Function(name)
    for k, v in LISTS.items():
        ld[k] = sp.Symbol(k) if preview else v
    for k, v in PROGRAM_NS.items():
        if callable(v) and not k.startswith("_") and k not in ld and not isinstance(v, type):
            ld[k] = v
    if preview:
        for k in VARS:
            ld[k] = sp.Symbol(k)
        for k, f in FUNCS.items():
            ld[k] = sp.Function(k)
        ld["ans"] = sp.Symbol("ans")
        for n in range(1, 21):
            ld[f"ans{n}"] = sp.Symbol(f"ans{n}")
    else:
        ld.update(VARS)
        ld.update(FUNCS)
        ids = ans_ids or []
        for n, hid in enumerate(ids[:50], start=1):
            if hid in HIST:
                ld[f"ans{n}"] = HIST[hid]
        if ids and ids[0] in HIST:
            ld["ans"] = HIST[ids[0]]
        for n in range(1, 51):
            ld.setdefault(f"ans{n}", _MissingAns(n))
        ld.setdefault("ans", _MissingAns(0))
    return ld


class _MissingAns:
    def __init__(self, n):
        self.n = n

    def _sympy_(self):
        raise CalcError("There is no previous answer yet" if self.n <= 1 else f"There is no ans{self.n} (only {len(HIST)} results)")


def _show_integral(e, v=None, a=None, b=None):
    v = v if v is not None else _var_for(e)
    if isinstance(v, (sp.Tuple, tuple)):
        return sp.Integral(e, tuple(v))
    return sp.Integral(e, (v, a, b)) if a is not None else sp.Integral(e, v)


def _show_diff(e, v=None, n=1, at=None):
    v = v if v is not None else _var_for(e)
    d = sp.Derivative(e, (v, n))
    return sp.Subs(d, v, at) if at is not None else d


def _show_sum(*a):
    if len(a) == 4:
        return sp.Sum(a[0], (a[1], a[2], a[3]))
    return sp.Function("sum")(*a)


def _show_product(*a):
    if len(a) == 4:
        return sp.Product(a[0], (a[1], a[2], a[3]))
    return sp.Function("product")(*a)


def _show_limit(e, v=None, a=0, d="+-"):
    v = v if v is not None else _var_for(e)
    return sp.Limit(e, v, a, str(d) if str(d) in ("+", "-") else "+-")


def parse(src, ans_ids=None, preview=False, extra=None):
    ctx = {}
    code = preprocess(src, ctx)
    ld = _local_dict(ctx, ans_ids, preview)
    if extra:
        ld.update(extra)
    try:
        if preview:
            with sp.evaluate(False):
                return parse_expr(code, local_dict=ld, transformations=TRANSFORMS, evaluate=False)
        return parse_expr(code, local_dict=ld, transformations=TRANSFORMS)
    except CalcError:
        raise
    except SyntaxError as exc:
        raise CalcError(_syntax_message(src, exc)) from None
    except TokenErrorLike() as exc:
        raise CalcError("Incomplete expression (a bracket is not closed?)") from None


def TokenErrorLike():
    try:
        from tokenize import TokenError
        return TokenError
    except Exception:  # pragma: no cover
        return SyntaxError


def _syntax_message(src, exc):
    msg = str(getattr(exc, "msg", exc))
    if "was never closed" in msg or "unexpected EOF" in msg:
        return "Incomplete expression (a bracket is not closed?)"
    if "unmatched" in msg:
        return "A closing bracket has no opening one"
    return "Syntax error: " + msg.split("(")[0].strip()


# ------------------------------------------------------------------ results

def _sci(v, digits):
    """A real number -> {sign, digits, exp}: value = sign 0.d1d2… × 10^(exp+1), i.e. d1.d2… × 10^exp."""
    mp = mpmath.mpmathify(v)
    if mp == 0:
        return {"sign": "", "digits": "0", "exp": 0}
    if mpmath.isinf(mp):
        return {"sign": "-" if mp < 0 else "", "digits": "inf", "exp": 0}
    if mpmath.isnan(mp):
        return {"sign": "", "digits": "nan", "exp": 0}
    sign, ds, exp = mpmath.libmp.to_digits_exp(mp._mpf_, digits + 3)
    ds, exp = round_digits(ds, int(exp), digits)
    return {"sign": "-" if sign == "-" else "", "digits": ds, "exp": exp}


def round_digits(ds, exp, n):
    """Round the significant digits ds (value d.ddd × 10^exp) to n digits; strip trailing zeros."""
    if len(ds) > n:
        head = [int(c) for c in ds[:n]]
        if int(ds[n]) >= 5:
            k = n - 1
            while k >= 0:
                head[k] += 1
                if head[k] < 10:
                    break
                head[k] = 0
                k -= 1
            if k < 0:
                head = [1] + head[:-1]
                exp += 1
        ds = "".join(map(str, head))
    return ds.rstrip("0") or "0", exp


def numeric(r, digits):
    """{re, im, abs, arg} as scientific digit strings, or None if r is not a plain number."""
    if not isinstance(r, sp.Expr) or not r.is_number or has_units(r):
        return None
    try:
        old = mpmath.mp.dps
        mpmath.mp.dps = digits + 10
        try:
            v = sp.N(r, digits + 5)
            re_, im_ = v.as_real_imag()
            re_m = mpmath.mpmathify(sp.N(re_, digits + 5))
            im_m = mpmath.mpmathify(sp.N(im_, digits + 5))
            out = {"re": _sci(re_m, digits), "im": _sci(im_m, digits) if im_m != 0 else None}
            if im_m != 0:
                z = mpmath.mpc(re_m, im_m)
                ang = mpmath.arg(z)
                f = _angle_factor()
                if f != 1:
                    ang = ang / mpmath.mpmathify(sp.N(f, digits + 10))
                out["abs"] = _sci(abs(z), digits)
                out["arg"] = _sci(ang, digits)
            return out
        finally:
            mpmath.mp.dps = old
    except (TypeError, ValueError, AttributeError):
        return None


def _latex(r):
    if isinstance(r, bool):
        return r"\\text{true}" if r else r"\\text{false}"
    if r is sp.true or r is True:
        return r"\\text{true}"
    if r is sp.false or r is False:
        return r"\\text{false}"
    if isinstance(r, str):
        return r"\\text{" + r.replace("\\\\", "") + "}"
    return sp.latex(r, mul_symbol=r"\\," if has_units(r) else None, ln_notation=True)


def _text(r):
    if isinstance(r, str):
        return r
    if isinstance(r, sp.MatrixBase):
        return "[" + ", ".join("[" + ", ".join(_text(r[i, j]) for j in range(r.cols)) + "]" for i in range(r.rows)) + "]"
    try:
        if isinstance(r, sp.Basic) and has_units(r):
            r = r.subs({q: sp.Symbol("_" + str(getattr(q, "kc_name", None) or q.abbrev)) for q in r.atoms(Quantity)})
        return sp.sstr(r)
    except Exception:
        return str(r)


def _is_exact(r):
    if not isinstance(r, sp.Basic):
        return True
    return not any(isinstance(a, sp.Float) for a in r.atoms(sp.Float))


def _unit_split(r):
    """5 km -> (5, km)."""
    if not has_units(r) or not isinstance(r, sp.Expr):
        return None
    mag, unit = sp.Integer(1), sp.Integer(1)
    for f in sp.Mul.make_args(r):
        if f.atoms(Quantity) and not (f.free_symbols - f.atoms(Quantity)):
            unit *= f
        else:
            mag *= f
    if mag.free_symbols:
        return None
    return mag, unit


def describe(r, digits):
    """The answer payload for a value."""
    mode = SETTINGS["number"]
    out = {"kind": "value"}
    if isinstance(r, Factored):
        out.update(latex=r._latex(), text=r._sympystr(), exact=True, num=numeric(r.value, digits))
        return out
    if isinstance(r, sp.Tuple):
        r = list(r)
    if isinstance(r, (list, tuple)):
        out.update(kind="list", latex=r"\\left[" + ",\\\\ ".join(_latex(v) for v in r) + r"\\right]", text=str([_text(v) for v in r]), exact=True)
        return out
    if isinstance(r, (bool,)) or r in (sp.true, sp.false):
        out.update(kind="bool", latex=_latex(r), text=str(bool(r)).lower(), exact=True)
        return out
    if isinstance(r, Solutions):
        rr = r
        if mode == "decimal" or any(isinstance(v, sp.Basic) and v.atoms(sp.Float) for v in r.values()):
            rr = r.evalf(digits)
        out.update(kind="solutions", latex=rr._latex(), text=rr._sympystr(), exact=_is_exact(rr),
                   values=[_text(v) for v in r.values()][:50])
        if mode == "exact" and _is_exact(rr) and any(not (v.is_Rational) for v in r.values() if isinstance(v, sp.Expr) and v.is_number):
            ap = r.evalf(digits)
            out["approx_latex"] = ap._latex()
            out["approx_text"] = ap._sympystr()
        return out
    if isinstance(r, Labeled):
        rr = r.evalf(digits) if mode == "decimal" else r
        out.update(kind="labeled", latex=rr._latex(), text=rr._sympystr(), exact=_is_exact(rr))
        return out
    if isinstance(r, sp.MatrixBase):
        rr = r.evalf(digits) if mode == "decimal" else r
        out.update(kind="matrix", latex=_latex(rr), text=_text(rr), exact=_is_exact(rr), rows=rr.rows, cols=rr.cols,
                   cells=[[_text(rr[i, j]) for j in range(rr.cols)] for i in range(rr.rows)] if rr.rows * rr.cols <= 400 else None)
        if mode == "exact" and not all(e.is_Rational for e in r if isinstance(e, sp.Expr)) and all(getattr(e, "is_number", False) for e in r):
            ap = r.evalf(digits)
            out["approx_latex"] = _latex(ap)
        if mode == "fraction":
            fr = r.applyfunc(lambda e: f_tofrac(e) if getattr(e, "is_real", False) and e.is_number else e)
            out["latex"] = _latex(fr)
            out["text"] = _text(fr)
        return out
    if isinstance(r, sp.Set) or isinstance(r, sp.Equality) or isinstance(r, sp.Rel) or isinstance(r, sp.Order):
        out.update(kind="expr", latex=_latex(r), text=_text(r), exact=True)
        return out
    if not isinstance(r, sp.Basic):
        try:
            r = sp.sympify(r)
        except Exception:
            out.update(kind="text", latex=_latex(str(r)), text=str(r), exact=True)
            return out
    if isinstance(r, sp.Basic) and not isinstance(r, sp.Expr):
        out.update(kind="expr", latex=_latex(r), text=_text(r), exact=True)
        return out
    # units
    us = _unit_split(r)
    if us is not None:
        mag, unit = us
        if mode == "decimal" or not _is_exact(mag):
            magv = sp.N(mag, digits)
        else:
            magv = mag
        out.update(kind="quantity", latex=(_latex(magv) + r"\\, " + _latex(unit)) if magv != 1 else _latex(unit), text=_text(magv * unit),
                   unit_latex=_latex(unit), unit_text=_text(unit), exact=_is_exact(magv), num=numeric(mag, digits))
        return out
    if r.is_Integer and int(r).bit_length() > HUGE_BITS:
        v = sp.N(r, digits)
        out.update(latex=_latex(v), text=_text(v), exact=False, num=numeric(r, digits), huge=True)
        return out
    exact = _is_exact(r)
    out["exact"] = exact
    out["num"] = numeric(r, digits) if r.is_number else None
    if mode == "decimal" and r.is_number:
        v = sp.N(r, digits)
        out.update(latex=_latex(v), text=_text(v))
    elif mode == "fraction" and r.is_number and r.is_real:
        fr = r if r.is_Rational else f_tofrac(r)
        out.update(latex=_latex(fr), text=_text(fr), approximate=not r.is_Rational)
        if fr.is_Rational and not fr.is_Integer and abs(fr) > 1:
            whole = int(abs(fr.p) // fr.q)
            rest = sp.Rational(abs(fr.p) % fr.q, fr.q)
            sign = "-" if fr < 0 else ""
            out["mixed_latex"] = f"{sign}{whole}\\\\,\\\\tfrac{{{rest.p}}}{{{rest.q}}}"
    else:
        text = _text(r)
        out.update(latex=_latex(r), text=text)
        if r.is_number and not r.is_Integer and not (r.is_Rational and mode == "exact" and False):
            out["show_approx"] = not r.is_Float and not (r.is_Integer)
        if r.is_Integer and len(text) > 40:
            out["long"] = True
    if not r.is_number and r.free_symbols and mode != "decimal":
        try:
            if r.atoms(sp.Float) or not r.free_symbols:
                pass
        except Exception:
            pass
    return out


# ------------------------------------------------------------------- eval

_DEF_FUNC = re.compile(r"^\\s*([A-Za-zͰ-Ͽ]\\w*)\\s*\\(([^()]*)\\)\\s*:=\\s*(.+)$", re.S)
_DEF_VAR = re.compile(r"^\\s*([A-Za-zͰ-Ͽ]\\w*)\\s*:=\\s*(.+)$", re.S)
RESERVED = {"pi", "e", "E", "i", "I", "oo", "ans"}


def _split_arrow(src):
    """'expr ▶ target' / 'expr -> target' at the top level."""
    s = src.replace("→", "▶").replace("⇒", "▶")
    depth = 0
    i = 0
    while i < len(s):
        c = s[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif depth == 0 and (c == "▶" or s.startswith("->", i)):
            w = 1 if c == "▶" else 2
            return s[:i], s[i + w:]
        i += 1
    return s, None


def _check_name(name):
    if name in RESERVED or name.startswith("ans"):
        raise CalcError(f"'{name}' is reserved")
    if name in BASE_NS:
        raise CalcError(f"'{name}' is a built-in function; choose another name")


def evaluate(src, ans_ids=None):
    src = src.strip()
    if not src:
        raise CalcError("Nothing to calculate")
    m = _DEF_FUNC.match(src)
    if m and ":=" in src:
        name, params, body = m.group(1), m.group(2), m.group(3)
        _check_name(name)
        ps = [sp.Symbol(p.strip()) for p in params.split(",") if p.strip()]
        if not ps:
            raise CalcError("A function needs parameters: f(x) := …")
        shadow = {k: sp.Symbol(k) for k in VARS}
        shadow.update({p.name: p for p in ps})
        expr = parse(body, ans_ids, extra=shadow)
        lam = sp.Lambda(tuple(ps), expr)
        FUNCS[name] = lam
        VARS.pop(name, None)
        DEF_SRC[name] = src
        return {"kind": "def", "name": name, "latex": f"{sp.latex(sp.Function(name)(*ps))} := {_latex(expr)}",
                "text": f"{name}({', '.join(p.name for p in ps)}) := {_text(expr)}", "exact": True}, lam
    m = _DEF_VAR.match(src)
    if m and ":=" in src:
        name, body = m.group(1), m.group(2)
        _check_name(name)
        value = _finish(parse(body, ans_ids))
        VARS[name] = value
        FUNCS.pop(name, None)
        DEF_SRC[name] = src
        d = describe(value, int(SETTINGS["digits"]))
        d["kind_value"] = d.get("kind")
        d.update(kind="def", name=name, latex=f"{sp.latex(sp.Symbol(name))} := {d['latex']}", text=f"{name} := {d['text']}")
        return d, value
    left, target = _split_arrow(src)
    if target is not None:
        t = target.strip()
        if re.fullmatch(r"[A-Za-zͰ-Ͽ]\\w*", t) and not _is_unit_target(t, left, ans_ids):  # store: expr -> a
            _check_name(t)
            value = _finish(parse(left, ans_ids))
            VARS[t] = value
            FUNCS.pop(t, None)
            DEF_SRC[t] = f"{t} := {left.strip()}"
            d = describe(value, int(SETTINGS["digits"]))
            d.update(kind="def", name=t, latex=f"{d['latex']} \\\\to {sp.latex(sp.Symbol(t))}", text=f"{t} := {d['text']}")
            return d, value
        value = parse(left, ans_ids)
        tl = t.lstrip("_")
        tl = {"°C": "degC", "°F": "degF", "°R": "degR"}.get(tl, tl)
        if tl in TEMPS and len(value.atoms(Quantity)) == 0 and value.atoms(sp.Symbol):
            syms = [s for s in value.atoms(sp.Symbol) if s.name in ("°C", "°F", "°R")]
            if syms:
                frm = {"°C": "degC", "°F": "degF", "°R": "degR"}[syms[0].name]
                mag = value.subs(syms[0], 1)
                r = convert_value(mag, frm, tl)
                unit_sym = sp.Symbol({"degC": "°C", "degF": "°F", "degR": "°R", "K": "K"}.get(tl, tl))
                d = describe(r, int(SETTINGS["digits"]))
                d["latex"] = d["latex"] + r"\\,\\mathrm{" + ("K" if tl == "K" else "{}^{\\\\circ}" + tl[-1]) + "}"
                return d, r * unit_sym
        if tl in ("degC", "degF", "degR") or value.atoms(sp.Symbol) & {sp.Symbol("°C"), sp.Symbol("°F"), sp.Symbol("°R")}:
            if has_units(value):
                kelvin = U.convert_to(value, U.kelvin) / U.kelvin
                r = convert_value(kelvin, "K", tl)
                d = describe(r, int(SETTINGS["digits"]))
                d["latex"] = d["latex"] + r"\\,{}^{\\circ}\\mathrm{" + tl[-1] + "}"
                return d, r
        tv = parse(t if t.startswith("_") or not re.match(r"[A-Za-z]", t) else _underscore_units(t), ans_ids)
        r = convert_units(value, tv)
        return describe(r, int(SETTINGS["digits"])), r
    value = _finish(parse(src, ans_ids))
    return describe(value, int(SETTINGS["digits"])), value


def _is_unit_target(t, left, ans_ids):
    """'x -> km' converts when x has a unit and km is one; otherwise it stores into a variable."""
    if t in TEMPS:
        return True
    try:
        lookup_unit(t)
    except CalcError:
        return False
    try:
        v = parse(left, ans_ids)
    except CalcError:
        return False
    return has_units(v) or bool(v.atoms(sp.Symbol) & {sp.Symbol("°C"), sp.Symbol("°F"), sp.Symbol("°R")}) if isinstance(v, sp.Basic) else False


def _underscore_units(t):
    """'km/h' -> '_km/_h' (conversion targets may skip the underscores)."""
    return re.sub(r"(?<![\\w.])([A-Za-zµμΩÅ][A-Za-z0-9µμΩÅ]*)", r"_\\1", t)


def _bind_vars(v):
    """Function bodies keep variable names (late binding): put the values in."""
    for _ in range(5):
        if not isinstance(v, sp.Basic) or isinstance(v, (Solutions, Labeled, Factored)):
            return v
        names = {s.name for s in v.free_symbols} & set(VARS)
        if not names:
            return v
        v = v.subs({sp.Symbol(n): VARS[n] for n in names})
    return v


def _finish(v):
    if isinstance(v, _MissingAns):
        v._sympy_()
    v = _bind_vars(v)
    if isinstance(v, (int, float, complex)) and not isinstance(v, bool):
        v = sp.sympify(v)
    if isinstance(v, list):
        v = to_matrix(v)
    if isinstance(v, sp.Basic) and not isinstance(v, (Solutions, Labeled, Factored)):
        if isinstance(v, (sp.Integral, sp.Derivative, sp.Limit, sp.Sum, sp.Product)):
            v = v.doit()
        v = simplify_units(v)
    if isinstance(v, sp.Expr) and v.is_number and not has_units(v):
        if v.atoms(sp.Float) and SETTINGS["number"] != "decimal":
            v = v.evalf(int(SETTINGS["digits"]) + 3)
        if v.has(sp.I) and not v.is_Float:
            try:
                v = sp.expand_complex(v)
            except Exception:
                pass
    if SETTINGS["number"] == "decimal" and isinstance(v, sp.Basic) and not isinstance(v, (Solutions, Labeled, Factored)):
        try:
            if isinstance(v, sp.MatrixBase) or (isinstance(v, sp.Expr) and v.is_number):
                v = v.evalf(int(SETTINGS["digits"]) + 3)
        except Exception:
            pass
    return v


def _store(hid, value):
    if hid is None:
        return
    HIST[hid] = value
    if hid in HIST_ORDER:
        HIST_ORDER.remove(hid)
    HIST_ORDER.append(hid)
    while len(HIST_ORDER) > MAX_HIST:
        HIST.pop(HIST_ORDER.pop(0), None)


# Cheap functions whose value the live preview may compute (the heavy ones stay inert).
PREVIEW_SAFE = ("ln", "log", "log10", "log2", "lg", "sign", "sgn", "arg", "angle", "cbrt", "root", "nthroot", "max", "min",
                "round", "trunc", "ipart", "frac", "fpart", "ceil", "mod", "nCr", "nPr", "comb", "perm", "polar", "cis",
                "lgamma", "erfinv", "lambertw", "W", "gcd", "lcm")


def _tidy(e):
    """Drop the 1·… factors that unevaluated parsing leaves (1/3 -> Mul(1, 1/3))."""
    if not isinstance(e, sp.Basic) or not e.args or isinstance(e, sp.MatrixBase):
        return e
    try:
        args = [_tidy(a) for a in e.args]
        if isinstance(e, sp.Mul):
            keep = [a for a in args if a != 1]
            if not keep:
                return sp.Integer(1)
            if len(keep) == 1:
                return keep[0]
            return sp.Mul(*keep, evaluate=False)
        if args == list(e.args):
            return e
        return e.func(*args, evaluate=False) if isinstance(e, (sp.Add, sp.Pow)) else e.func(*args)
    except Exception:
        return e


def preview(src, ans_ids=None, approx=True):
    """While typing: the input as LaTeX and, when cheap, a numeric value."""
    s = src.strip()
    out = {"latex": "", "approx": None}
    if not s:
        return out
    m = _DEF_FUNC.match(s) or _DEF_VAR.match(s)
    body = s
    head = ""
    if m and ":=" in s:
        if len(m.groups()) == 3:
            head = f"{m.group(1)}\\\\left({m.group(2)}\\\\right) := "
            body = m.group(3)
        else:
            head = f"{sp.latex(sp.Symbol(m.group(1)))} := "
            body = m.group(2)
    left, target = _split_arrow(body)
    e = _tidy(parse(left, ans_ids, preview=True))
    tex = head + _latex(e)
    if target is not None:
        t = target.strip()
        try:
            tt = parse(t if t.startswith("_") or not re.match(r"[A-Za-z]", t) else _underscore_units(t), ans_ids, preview=True)
            tex += r" \\;\\blacktriangleright\\; " + _latex(_tidy(tt))
        except CalcError:
            tex += r" \\;\\blacktriangleright\\; \\text{" + t.replace("_", "") + "}"
    out["latex"] = tex
    # A cheap numeric value: only numbers with elementary/special functions (heavy ones stay inert
    # in preview mode), with the angle unit, the variables and earlier answers put in.
    if not approx or head or target is not None:
        return out
    try:
        extra = {k: v for k, v in _trig_ns().items() if k != "_DEG_"}
        for name in PREVIEW_SAFE:
            extra[name] = (lambda f: (lambda *a, **kw: f(*a)))(BASE_NS[name])
        extra.update(VARS)
        extra.update(FUNCS)
        ids = ans_ids or []
        for n, hid in enumerate(ids[:50], start=1):
            if hid in HIST:
                extra[f"ans{n}"] = HIST[hid]
        if ids and ids[0] in HIST:
            extra["ans"] = HIST[ids[0]]
        e2 = parse(left, ans_ids, preview=True, extra=extra)
        if isinstance(e2, sp.Expr) and not e2.atoms(sp.Symbol) and not has_units(e2) \\
                and not any(isinstance(f, sp.core.function.AppliedUndef) for f in e2.atoms(sp.Function)):
            old = mpmath.mp.dps
            mpmath.mp.dps = 20
            try:
                v = sp.lambdify([], e2, modules=["mpmath"])()
                if isinstance(v, (mpmath.mpf, mpmath.mpc, int, float, complex)):
                    z = mpmath.mpmathify(v)
                    out["approx"] = {"re": _sci(mpmath.re(z), 15), "im": _sci(mpmath.im(z), 15) if mpmath.im(z) != 0 else None}
            finally:
                mpmath.mp.dps = old
    except Exception:
        pass
    return out
    try:
        if not head and target is None and isinstance(e, sp.Expr) and not e.free_symbols - {sp.Symbol("ans")} and not e.atoms(sp.Symbol) \\
                and not any(isinstance(f, sp.core.function.AppliedUndef) for f in e.atoms(sp.Function)) \\
                and not has_units(e) and not isinstance(e, sp.MatrixBase):
            old = mpmath.mp.dps
            mpmath.mp.dps = 20
            try:
                fn = sp.lambdify([], e, modules=["mpmath"])
                v = fn()
                if isinstance(v, (mpmath.mpf, mpmath.mpc, int, float, complex)):
                    z = mpmath.mpmathify(v)
                    out["approx"] = {"re": _sci(mpmath.re(z), 15), "im": _sci(mpmath.im(z), 15) if mpmath.im(z) != 0 else None}
            finally:
                mpmath.mp.dps = old
    except Exception:
        pass
    return out


# ---------------------------------------------------------------- graphing

def _lambdify(vars_, e):
    import numpy as np  # noqa: F401
    return sp.lambdify(vars_, e, modules=["numpy", "scipy"])


def _clean(arr):
    import numpy as np
    a = np.array(arr)
    if np.iscomplexobj(a):
        ok = np.abs(a.imag) <= 1e-9 * np.maximum(1, np.abs(a.real))
        a = np.where(ok, a.real, np.nan)
    a = np.asarray(a, dtype=float)
    a[~np.isfinite(a)] = np.nan
    return [None if v != v else round(float(v), 12) for v in a]


def _graph_expr(src, names=("x",)):
    syms = {n: sp.Symbol(n) for n in names}
    e = parse(src, None, extra=syms)
    if isinstance(e, sp.Equality):
        return e
    e = _finish(e) if not isinstance(e, sp.Expr) else e
    return e


def sample(items, xmin, xmax, ymin, ymax, n=600):
    import numpy as np
    out = []
    for it in items:
        kind = it.get("kind", "y")
        try:
            if kind == "y":
                e = _graph_expr(it["expr"], ("x",))
                if isinstance(e, sp.Equality):
                    e = e.rhs if e.lhs == sp.Symbol("y") else e.lhs - e.rhs
                xs = np.linspace(xmin, xmax, int(n))
                f = _lambdify([sp.Symbol("x")], e)
                with np.errstate(all="ignore"):
                    ys = f(xs)
                if np.isscalar(ys) or np.ndim(ys) == 0:
                    ys = np.full_like(xs, complex(ys) if np.iscomplexobj(ys) else float(ys), dtype=complex if np.iscomplexobj(ys) else float)
                out.append({"ok": True, "x": _clean(xs), "y": _clean(ys)})
            elif kind in ("param", "polar"):
                tn = "t" if kind == "param" else "theta"
                t0, t1 = float(sp.N(parse(str(it.get("tmin", 0))))), float(sp.N(parse(str(it.get("tmax", "2*pi")))))
                ts = np.linspace(t0, t1, int(n) * 2)
                if kind == "param":
                    ex = _graph_expr(it["expr"], (tn,))
                    ey = _graph_expr(it["expr2"], (tn,))
                    with np.errstate(all="ignore"):
                        X = _lambdify([sp.Symbol(tn)], ex)(ts)
                        Y = _lambdify([sp.Symbol(tn)], ey)(ts)
                else:
                    er = _graph_expr(it["expr"], ("theta", "θ"))
                    er = er.subs(sp.Symbol("θ"), sp.Symbol("theta"))
                    with np.errstate(all="ignore"):
                        R = _lambdify([sp.Symbol("theta")], er)(ts)
                        R = np.broadcast_to(R, ts.shape)
                        X = R * np.cos(ts)
                        Y = R * np.sin(ts)
                X = np.broadcast_to(X, ts.shape)
                Y = np.broadcast_to(Y, ts.shape)
                out.append({"ok": True, "x": _clean(X), "y": _clean(Y)})
            elif kind == "implicit":
                e = _graph_expr(it["expr"], ("x", "y"))
                if isinstance(e, sp.Equality):
                    e = e.lhs - e.rhs
                nx = int(it.get("nx", 160))
                ny = int(it.get("ny", 120))
                xs = np.linspace(xmin, xmax, nx)
                ys = np.linspace(ymin, ymax, ny)
                X, Y = np.meshgrid(xs, ys)
                with np.errstate(all="ignore"):
                    Z = _lambdify([sp.Symbol("x"), sp.Symbol("y")], e)(X, Y)
                Z = np.broadcast_to(Z, X.shape)
                out.append({"ok": True, "nx": nx, "ny": ny, "z": [_clean(row) for row in np.asarray(Z)]})
            elif kind == "ode":
                from scipy.integrate import solve_ivp
                e = _graph_expr(it["expr"], ("x", "y"))
                f = _lambdify([sp.Symbol("x"), sp.Symbol("y")], e)
                x0 = float(sp.N(parse(str(it.get("x0", 0)))))
                y0 = float(sp.N(parse(str(it.get("y0", 1)))))
                pts_x, pts_y = [], []
                for lo, hi in ((x0, xmin), (x0, xmax)):
                    if lo == hi:
                        continue
                    sol = solve_ivp(lambda xx, yy: [float(f(xx, yy[0]))], (lo, hi), [y0], dense_output=True, rtol=1e-8, atol=1e-10,
                                    max_step=abs(hi - lo) / 200)
                    xs = np.linspace(lo, sol.t[-1], int(n) // 2)
                    ys = sol.sol(xs)[0]
                    if hi < lo:
                        xs, ys = xs[::-1], ys[::-1]
                        pts_x = list(xs) + pts_x
                        pts_y = list(ys) + pts_y
                    else:
                        pts_x += list(xs)
                        pts_y += list(ys)
                out.append({"ok": True, "x": _clean(pts_x), "y": _clean(pts_y)})
            else:
                out.append({"ok": False, "error": f"Unknown graph kind {kind}"})
        except CalcError as exc:
            out.append({"ok": False, "error": str(exc)})
        except Exception as exc:
            out.append({"ok": False, "error": f"{type(exc).__name__}: {exc}"})
    return out


def _fn_of_x(src):
    e = _graph_expr(src, ("x",))
    if isinstance(e, sp.Equality):
        e = e.rhs if e.lhs == sp.Symbol("y") else e.lhs - e.rhs
    return e


def analyze(what, expr, xmin, xmax, expr2=None):
    """Roots, extrema, intersections, integral of y=f(x) in [xmin, xmax]."""
    import numpy as np
    from scipy.optimize import brentq
    x = sp.Symbol("x")
    e = _fn_of_x(expr)
    if what == "integral":
        v = _with_dps(lambda: _float_result(mpmath.quad(sp.lambdify(x, e, "mpmath"), [mpmath.mpf(xmin), mpmath.mpf(xmax)])))
        return {"value": float(sp.re(v)), "text": _text(sp.N(v, int(SETTINGS["digits"])))}
    if what == "intersect":
        if not expr2:
            raise CalcError("Pick a second function")
        g = e - _fn_of_x(expr2)
    elif what == "extrema":
        g = sp.diff(e, x)
    else:
        g = e
    fg = _lambdify([x], g)
    fe = _lambdify([x], e)
    xs = np.linspace(xmin, xmax, 4001)
    with np.errstate(all="ignore"):
        ys = np.asarray(fg(xs), dtype=complex) * np.ones_like(xs)
    ys = np.where(np.abs(ys.imag) < 1e-12, ys.real, np.nan).astype(float)
    pts = []

    def real_f(v):
        r = complex(fg(v))
        return r.real
    for k in range(len(xs) - 1):
        a, b = ys[k], ys[k + 1]
        if not (np.isfinite(a) and np.isfinite(b)):
            continue
        if a == 0:
            r = xs[k]
        elif a * b < 0:
            try:
                r = brentq(real_f, xs[k], xs[k + 1], xtol=1e-14, maxiter=200)
            except Exception:
                continue
            # a sign change across a pole is not a root
            if abs(real_f(r)) > 1e-6 * (1 + abs(a) + abs(b)):
                continue
        else:
            continue
        with np.errstate(all="ignore"):
            yv = complex(fe(r)).real
        p = {"x": float(r), "y": float(yv)}
        if what == "extrema":
            d2 = sp.diff(g, x)
            try:
                c = float(sp.N(d2.subs(x, r)))
                p["type"] = "min" if c > 0 else "max" if c < 0 else "inflection"
            except Exception:
                p["type"] = "extremum"
        if not pts or abs(pts[-1]["x"] - p["x"]) > 1e-9 * (1 + abs(p["x"])):
            pts.append(p)
        if len(pts) >= 60:
            break
    return {"points": pts}


def table(exprs, start, step, count):
    import numpy as np
    x = sp.Symbol("x")
    xs = [float(start) + k * float(step) for k in range(int(count))]
    cols = []
    for src in exprs:
        try:
            f = _lambdify([x], _fn_of_x(src))
            with np.errstate(all="ignore"):
                cols.append(_clean(np.asarray(f(np.asarray(xs)), dtype=complex) * np.ones(len(xs))))
        except Exception as exc:
            cols.append({"error": str(exc)})
    return {"x": xs, "cols": cols}


# ------------------------------------------------------------- statistics

def dist(name, fn, x, params):
    import scipy.stats as st
    p = [float(v) for v in params]
    table_ = {
        "normal": lambda: st.norm(p[0] if p else 0, p[1] if len(p) > 1 else 1),
        "t": lambda: st.t(p[0]),
        "chi2": lambda: st.chi2(p[0]),
        "f": lambda: st.f(p[0], p[1]),
        "exponential": lambda: st.expon(scale=1 / p[0]),
        "uniform": lambda: st.uniform(p[0], p[1] - p[0]),
        "gamma": lambda: st.gamma(p[0], scale=p[1] if len(p) > 1 else 1),
        "beta": lambda: st.beta(p[0], p[1]),
        "lognormal": lambda: st.lognorm(p[1], scale=math.exp(p[0])),
        "weibull": lambda: st.weibull_min(p[0], scale=p[1] if len(p) > 1 else 1),
        "cauchy": lambda: st.cauchy(p[0] if p else 0, p[1] if len(p) > 1 else 1),
        "binomial": lambda: st.binom(int(p[0]), p[1]),
        "poisson": lambda: st.poisson(p[0]),
        "geometric": lambda: st.geom(p[0]),
        "hypergeometric": lambda: st.hypergeom(int(p[0]), int(p[1]), int(p[2])),
        "negbinomial": lambda: st.nbinom(p[0], p[1]),
    }
    if name not in table_:
        raise CalcError(f"Unknown distribution {name}")
    d = table_[name]()
    discrete = name in ("binomial", "poisson", "geometric", "hypergeometric", "negbinomial")
    xv = float(x)
    if fn == "pdf":
        v = d.pmf(xv) if discrete else d.pdf(xv)
    elif fn == "cdf":
        v = d.cdf(xv)
    elif fn == "sf":
        v = d.sf(xv)
    elif fn == "inv":
        v = d.ppf(xv)
    else:
        raise CalcError(f"Unknown function {fn}")
    stats = {}
    try:
        m, var_ = d.stats(moments="mv")
        stats = {"mean": float(m), "var": float(var_)}
    except Exception:
        pass
    # a curve for the plot
    lo, hi = d.ppf(0.0005), d.ppf(0.9995)
    if not math.isfinite(lo):
        lo = -10
    if not math.isfinite(hi):
        hi = 10
    if discrete:
        ks = list(range(int(math.floor(lo)), int(math.ceil(hi)) + 1))[:400]
        curve = {"x": ks, "y": [float(d.pmf(k)) for k in ks], "discrete": True}
    else:
        import numpy as np
        xs = np.linspace(lo, hi, 300)
        curve = {"x": [float(v) for v in xs], "y": _clean(d.pdf(xs)), "discrete": False}
    return {"value": float(v), **stats, "curve": curve}


def hypothesis(kind, data, opts):
    import numpy as np
    import scipy.stats as st
    alt = opts.get("alternative", "two-sided")
    mu0 = float(opts.get("mu0", 0))
    a = np.asarray([float(v) for v in data.get("a", []) if v is not None], dtype=float)
    b = np.asarray([float(v) for v in data.get("b", []) if v is not None], dtype=float)
    res = {}
    if kind == "t1":
        r = st.ttest_1samp(a, mu0, alternative=alt)
        ci = r.confidence_interval(float(opts.get("level", 0.95)))
        res = {"statistic": float(r.statistic), "df": float(r.df), "p": float(r.pvalue), "ci": [float(ci.low), float(ci.high)],
               "mean": float(a.mean()), "sd": float(a.std(ddof=1)), "n": int(a.size)}
    elif kind == "t2":
        eqv = bool(opts.get("pooled", False))
        r = st.ttest_ind(a, b, equal_var=eqv, alternative=alt)
        res = {"statistic": float(r.statistic), "df": float(getattr(r, "df", float("nan"))), "p": float(r.pvalue),
               "mean_a": float(a.mean()), "mean_b": float(b.mean())}
        try:
            ci = r.confidence_interval(float(opts.get("level", 0.95)))
            res["ci"] = [float(ci.low), float(ci.high)]
        except Exception:
            pass
    elif kind == "paired":
        r = st.ttest_rel(a, b, alternative=alt)
        res = {"statistic": float(r.statistic), "df": float(r.df), "p": float(r.pvalue), "mean_diff": float((a - b).mean())}
    elif kind == "z1":
        sigma = float(opts.get("sigma", 1))
        z = (a.mean() - mu0) / (sigma / math.sqrt(a.size))
        p = 2 * st.norm.sf(abs(z)) if alt == "two-sided" else st.norm.sf(z) if alt == "greater" else st.norm.cdf(z)
        lvl = float(opts.get("level", 0.95))
        h = st.norm.ppf(0.5 + lvl / 2) * sigma / math.sqrt(a.size)
        res = {"statistic": float(z), "p": float(p), "mean": float(a.mean()), "n": int(a.size), "ci": [float(a.mean() - h), float(a.mean() + h)]}
    elif kind == "prop1":
        xk, n, p0 = float(opts.get("successes", 0)), float(opts.get("n", 1)), float(opts.get("p0", 0.5))
        ph = xk / n
        z = (ph - p0) / math.sqrt(p0 * (1 - p0) / n)
        p = 2 * st.norm.sf(abs(z)) if alt == "two-sided" else st.norm.sf(z) if alt == "greater" else st.norm.cdf(z)
        res = {"statistic": float(z), "p": float(p), "phat": ph}
    elif kind == "chi2gof":
        exp_ = b if b.size else None
        r = st.chisquare(a, exp_ * a.sum() / exp_.sum() if exp_ is not None else None)
        res = {"statistic": float(r.statistic), "df": int(a.size - 1), "p": float(r.pvalue)}
    elif kind == "chi2ind":
        cols = [np.asarray([float(v) for v in c if v is not None]) for c in data.get("table", [])]
        m = np.vstack(cols).T
        chi2, p, dof, expected = st.chi2_contingency(m)
        res = {"statistic": float(chi2), "df": int(dof), "p": float(p)}
    elif kind == "anova":
        groups = [np.asarray([float(v) for v in c if v is not None]) for c in data.get("table", [])]
        r = st.f_oneway(*groups)
        res = {"statistic": float(r.statistic), "p": float(r.pvalue), "df": [len(groups) - 1, int(sum(g.size for g in groups) - len(groups))]}
    elif kind == "linreg":
        r = st.linregress(a, b, alternative=alt)
        res = {"statistic": float(r.slope / r.stderr) if r.stderr else float("nan"), "p": float(r.pvalue), "slope": float(r.slope),
               "intercept": float(r.intercept), "r": float(r.rvalue), "df": int(a.size - 2), "stderr": float(r.stderr)}
    elif kind == "normality":
        r = st.shapiro(a)
        res = {"statistic": float(r.statistic), "p": float(r.pvalue)}
    else:
        raise CalcError(f"Unknown test {kind}")
    return {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in res.items()}


def fill(expr, var=None, start=None, stop=None, step=1):
    """A list from a formula of the other lists (row by row), or a sequence in var."""
    used = [n for n in LISTS if re.search(rf"\\b{n}\\b", expr)]
    syms = {n: sp.Symbol(n) for n in used}
    extra = dict(syms)
    ks = []
    if var:
        extra[var] = sp.Symbol(var)
        if step == 0:
            raise CalcError("The step cannot be 0")
        count = int(math.floor((float(stop) - float(start)) / float(step) + 1e-9)) + 1
        if count > 10000:
            raise CalcError("At most 10,000 values")
        ks = [sp.nsimplify(start) + i * sp.nsimplify(step) for i in range(max(0, count))]
    e = _bind_vars(parse(expr, None, extra=extra))
    rows = max([len(LISTS[n]) for n in used], default=0) if used else len(ks)
    if var and used:
        rows = min(rows, len(ks)) if ks else rows
    out = []
    for i in range(rows):
        sub = {syms[n]: (LISTS[n][i] if i < len(LISTS[n]) else sp.nan) for n in used}
        if var:
            sub[sp.Symbol(var)] = ks[i]
        try:
            f = float(sp.N(e.subs(sub)))
            out.append(f if math.isfinite(f) else None)
        except Exception:
            out.append(None)
    return out


# ------------------------------------------------------------------ session

def variables():
    out = []
    for k, v in VARS.items():
        try:
            tex = _latex(v)
        except Exception:
            tex = _text(v)
        out.append({"name": k, "kind": "var", "latex": f"{sp.latex(sp.Symbol(k))} = {tex}", "text": f"{k} = {_text(v)}", "src": DEF_SRC.get(k)})
    for k, f in FUNCS.items():
        args = f.args[0] if isinstance(f.args[0], tuple) else (f.args[0],)
        try:
            ps = tuple(f.variables)
        except Exception:
            ps = args
        out.append({"name": k, "kind": "func", "latex": f"{sp.latex(sp.Function(k)(*ps))} = {_latex(f.expr)}",
                    "text": f"{k}({', '.join(map(str, ps))}) = {_text(f.expr)}", "src": DEF_SRC.get(k)})
    out.sort(key=lambda d: d["name"].lower())
    return out


def set_settings(s):
    if not s:
        return
    for k in ("number", "angle", "complex"):
        if k in s and s[k]:
            SETTINGS[k] = str(s[k])
    if "digits" in s and s["digits"]:
        SETTINGS["digits"] = max(1, min(1000, int(s["digits"])))


def _restore_value(text):
    try:
        ns = {}
        ns.update({k: getattr(sp, k) for k in dir(sp) if not k.startswith("_")})
        ns.update(UNITS)
        return eval(text, ns)
    except Exception:
        return None


# ------------------------------------------------------------------ dispatch

def dispatch(req):
    op = req.get("op")
    set_settings(req.get("settings"))
    try:
        if op == "init":
            return {"ok": True, "version": VERSION, "sympy": sp.__version__, "mpmath": mpmath.__version__, "functions": function_names()}
        if op == "eval":
            payload, value = evaluate(req.get("src", ""), req.get("ans"))
            _store(req.get("id"), value)
            payload["ok"] = True
            try:
                payload["input_latex"] = preview(req.get("src", ""), req.get("ans"), approx=False)["latex"]
            except Exception:
                payload["input_latex"] = None
            try:
                payload["srepr"] = sp.srepr(value) if isinstance(value, sp.Basic) and not isinstance(value, (Solutions, Labeled, Factored)) else None
                if payload["srepr"] and len(payload["srepr"]) > 200000:
                    payload["srepr"] = None
            except Exception:
                payload["srepr"] = None
            if payload.get("kind") == "def":
                payload["vars"] = variables()
            return payload
        if op == "preview":
            r = preview(req.get("src", ""), req.get("ans"))
            r["ok"] = True
            return r
        if op == "vars":
            return {"ok": True, "vars": variables()}
        if op == "delvar":
            name = req.get("name")
            VARS.pop(name, None)
            FUNCS.pop(name, None)
            DEF_SRC.pop(name, None)
            return {"ok": True, "vars": variables()}
        if op == "clearvars":
            VARS.clear()
            FUNCS.clear()
            DEF_SRC.clear()
            return {"ok": True, "vars": []}
        if op == "forget":
            for hid in req.get("ids", []):
                HIST.pop(hid, None)
                if hid in HIST_ORDER:
                    HIST_ORDER.remove(hid)
            return {"ok": True}
        if op == "restore":
            errors = []
            for src in req.get("defs", []):
                try:
                    evaluate(src)
                except Exception as exc:
                    errors.append(f"{src}: {exc}")
            for item in req.get("results", []):
                v = _restore_value(item.get("srepr") or "")
                if v is not None:
                    _store(item.get("id"), v)
            LISTS.clear()
            for k, vals in (req.get("lists") or {}).items():
                LISTS[k] = sp.Matrix([sp.nsimplify(v) if isinstance(v, int) else sp.Float(v, 15) for v in vals if v is not None]) if vals else sp.Matrix([])
            return {"ok": True, "errors": errors, "vars": variables()}
        if op == "lists":
            LISTS.clear()
            for k, vals in (req.get("lists") or {}).items():
                clean = [v for v in vals if v is not None]
                LISTS[k] = sp.Matrix([sp.Integer(v) if float(v).is_integer() and abs(v) < 1e15 else sp.Float(v, 15) for v in clean]) if clean else sp.Matrix([])
            return {"ok": True}
        if op == "fill":
            return {"ok": True, "values": fill(req["expr"], req.get("var"), req.get("start"), req.get("stop"), req.get("step", 1))}
        if op == "sample":
            return {"ok": True, "series": sample(req["items"], float(req["xmin"]), float(req["xmax"]), float(req.get("ymin", -10)),
                                                  float(req.get("ymax", 10)), int(req.get("n", 600)))}
        if op == "analyze":
            r = analyze(req["what"], req["expr"], float(req["xmin"]), float(req["xmax"]), req.get("expr2"))
            r["ok"] = True
            return r
        if op == "table":
            r = table(req["exprs"], req.get("start", 0), req.get("step", 1), req.get("count", 20))
            r["ok"] = True
            return r
        if op == "convert":
            v = parse(str(req.get("value", "1")))
            r = convert_value(v, req["from"], req["to"])
            d = describe(r, int(SETTINGS["digits"]))
            d["ok"] = True
            return d
        if op == "units":
            return {"ok": True, "units": unit_catalog(), "prefixes": list(PREFIXES), "prefixable": list(PREFIXABLE)}
        if op == "constants":
            return {"ok": True, "constants": constants_list()}
        if op == "dist":
            r = dist(req["name"], req["fn"], req["x"], req.get("params", []))
            r["ok"] = True
            return r
        if op == "test":
            r = hypothesis(req["kind"], req.get("data", {}), req.get("opts", {}))
            r["ok"] = True
            return r
        return {"ok": False, "error": f"Unknown request {op}"}
    except CalcError as exc:
        return {"ok": False, "error": str(exc)}
    except RecursionError:
        return {"ok": False, "error": "Too deeply nested"}
    except ZeroDivisionError:
        return {"ok": False, "error": "Division by zero"}
    except Exception as exc:  # SymPy's own errors: keep the message short
        msg = str(exc).strip().split("\\n")[0][:400]
        return {"ok": False, "error": f"{type(exc).__name__}: {msg}" if msg else type(exc).__name__}


def call(b64):
    req = json.loads(base64.b64decode(b64).decode("utf-8"))
    res = dispatch(req)
    return base64.b64encode(json.dumps(res, default=_json_default, allow_nan=False).encode("utf-8")).decode("ascii")


def emit(b64):
    """call() for the KherveOS bridge: the answer goes to stdout between markers (cell results are cut at 20,000 characters)."""
    out = call(b64)
    sys.stdout.write("\\x1eKC>" + out + "<KC\\x1e\\n")
    sys.stdout.flush()


def _json_default(o):
    if isinstance(o, sp.Basic):
        return str(o)
    if isinstance(o, set):
        return sorted(o)
    return str(o)


if __name__ == "__main__":  # quick manual check
    for line in sys.argv[1:]:
        print(json.dumps(dispatch({"op": "eval", "src": line}), indent=1, default=_json_default))
`;function fe(e){return`import sympy, mpmath, numpy
if False:
    import scipy
import sys as _kc_sys, types as _kc_types, json as _kc_json
_kc_mod = _kc_types.ModuleType('kcalc_engine')
_kc_sys.modules['kcalc_engine'] = _kc_mod
exec(compile(_kc_json.loads(${JSON.stringify(JSON.stringify(e))}), 'kcalc_engine.py', 'exec'), _kc_mod.__dict__)\n_kc_mod.PROGRAM_NS = globals()
del _kc_mod, _kc_sys, _kc_types, _kc_json`}function pe(e){return`__import__('kcalc_engine').emit('${e}')`}function me(e){let t=e.lastIndexOf(`KC>`);if(t<0)return null;let n=e.indexOf(`<KC`,t);return n<0?null:e.slice(t+4,n)}var he=class{kernel;onBusy=()=>{};onProgress=()=>{};onRestarted=async()=>{};queue=[];running=!1;installedFor=null;installing=null;disposed=!1;generation=0;unsub;constructor(e){this.kernel=new re(e),this.unsub=this.kernel.onStatus(e=>{(e===`off`||e===`dead`)&&(this.installedFor=null)})}get status(){return this.kernel.status}call(e,t={}){return new Promise((n,r)=>{if(e===`preview`){for(let e of this.queue.filter(e=>e.req.op===`preview`))e.resolve(null);this.queue=this.queue.filter(e=>e.req.op!==`preview`)}this.queue.push({req:{op:e,...t},resolve:n,reject:r}),this.pump()})}async runProgram(e,t){await this.ensure(),this.running=!0,this.onBusy({op:`program`,since:Date.now()});try{return await this.kernel.runCell(e,{onStdout:e=>t(`out`,e),onStderr:e=>t(`err`,e),onStatus:e=>t(`info`,e.endsWith(`
`)?e:e+`
`)})}finally{this.running=!1,this.onBusy(null),this.pump()}}async cancel(){let e=Error(`Cancelled`);this.generation++;for(let t of this.queue.splice(0))t.reject(e);this.installedFor=null,this.installing=null,await this.kernel.restart().catch(()=>{}),this.onBusy(null);try{await this.ensure()}catch{}}dispose(){this.disposed=!0,this.unsub();for(let e of this.queue.splice(0))e.reject(Error(`kCalc was closed.`));this.kernel.dispose()}async ensure(){(this.installedFor!==this.kernel||this.kernel.status===`off`||this.kernel.status===`dead`)&&(this.installing??=this.install().finally(()=>this.installing=null),await this.installing)}async install(){this.onProgress(`Starting Python…`);try{await this.kernel.start();let e=fe(de),t=await this.kernel.runCell(e,{onStatus:e=>this.onProgress(e)});if(!t.ok)throw Error(t.error?`${t.error.type}: ${t.error.message}`:`The engine could not start.`);this.installedFor=this.kernel}finally{this.onProgress(null)}await this.onRestarted()}async direct(e,t={}){return this.exec({op:e,...t})}async exec(e){let t=ge(new TextEncoder().encode(JSON.stringify(e))),n=``,r=await this.kernel.runCell(pe(t),{onStdout:e=>n+=e}),i=me(n);if(!r.ok||i===null)throw Error(r.error?`${r.error.type}: ${r.error.message}`:`The engine gave no answer.`);return JSON.parse(new TextDecoder().decode(_e(i)))}async pump(){if(this.running||this.disposed)return;let e=this.queue.shift();if(!e)return;this.running=!0,this.onBusy({op:String(e.req.op),since:Date.now()});let t=this.generation;try{await this.ensure(),e.resolve(await this.exec(e.req))}catch(n){e.reject(t===this.generation?n instanceof Error?n:Error(String(n)):Error(`Cancelled`))}finally{this.running=!1,this.queue.length||this.onBusy(null),this.pump()}}};function ge(e){let t=``;for(let n=0;n<e.length;n+=32768)t+=String.fromCharCode(...e.subarray(n,n+32768));return btoa(t)}function _e(e){let t=atob(e),n=new Uint8Array(t.length);for(let e=0;e<t.length;e++)n[e]=t.charCodeAt(e);return n}var B=i(),V=(0,z.memo)(function({tex:e,display:t=!1,className:n}){let r=(0,z.useMemo)(()=>{try{return R.renderToString(e,{throwOnError:!1,displayMode:t,strict:`ignore`,trust:!1,output:`html`,maxExpand:500})}catch{return null}},[e,t]);return r===null?(0,B.jsx)(`span`,{className:`kc-tex-fallback ${n??``}`,children:e}):(0,B.jsx)(`span`,{className:n,dangerouslySetInnerHTML:{__html:r}})});function ve(e,t,n){if(n<=0)return{digits:`0`,exp:t};if(e.length<=n)return{digits:e.replace(/0+$/,``)||`0`,exp:t};let r=e.slice(0,n).split(``).map(Number);if(Number(e[n])>=5){let e=n-1;for(;e>=0&&(r[e]++,!(r[e]<10));)r[e]=0,e--;e<0&&(r.unshift(1),r.pop(),t++)}return{digits:r.join(``).replace(/0+$/,``)||`0`,exp:t}}var ye=e=>/^0*$/.test(e.digits);function H(e,t,n=0){let r,i;return t<=0?(r=`0`,i=`0`.repeat(-t)+e):t>=e.length?(r=e+`0`.repeat(t-e.length),i=``):(r=e.slice(0,t),i=e.slice(t)),i=i.replace(/0+$/,``),i.length<n&&(i+=`0`.repeat(n-i.length)),i?`${r}.${i}`:r}function be(e){return e.digits===`inf`?{text:`${e.sign}oo`,latex:`${e.sign}\\infty`}:e.digits===`nan`?{text:`nan`,latex:`\\text{undefined}`}:null}function xe(e,t,n){return t===0?{text:n+e,latex:n+e}:{text:`${n}${e}e${t}`,latex:`${n}${e}\\times 10^{${t}}`}}function Se(e,t){let n=be(e);if(n)return n;if(ye(e)){let e=t.format===`fix`?H(`0`,1,t.fix):`0`;return{text:e,latex:e}}let r=e.sign;if(t.format===`fix`){let n=e.exp+1+t.fix;if(n<=0){let i=n===0&&Number(e.digits[0])>=5,a=i?H(`1`,-t.fix+1,t.fix):H(`0`,1,t.fix),o=i?r:``;return{text:o+a,latex:o+a}}let i=ve(e.digits,e.exp,n),a=H(i.digits,i.exp+1,t.fix);return{text:r+a,latex:r+a}}let i=t.fix>0&&t.format!==`normal`?t.fix:t.digits,a=ve(e.digits,e.exp,Math.max(1,i));if(t.format===`sci`)return xe(H(a.digits,1),a.exp,r);if(t.format===`eng`){let e=Math.floor(a.exp/3)*3;return xe(H(a.digits,a.exp-e+1),e,r)}if(a.exp>=-5&&a.exp<Math.max(t.digits,1)){let e=H(a.digits,a.exp+1);return{text:r+e,latex:r+e}}return xe(H(a.digits,1),a.exp,r)}function Ce(e,t,n=`rect`,r=`rad`){if(!e.im||ye(e.im))return Se(e.re,t);if(n===`polar`&&e.abs&&e.arg){let n=Se(e.abs,t),i=Se(e.arg,t),a=r===`deg`,o=r===`grad`;return{text:`${n.text}∠${i.text}${a?`°`:``}`,latex:`${n.latex}\\angle ${i.latex}${a?`^{\\circ}`:o?`^{\\mathrm{g}}`:``}`}}let i=Se({...e.im,sign:``},t),a=i.text===`1`?``:i.text,o=i.latex===`1`?``:i.latex;if(ye(e.re)){let t=e.im.sign;return{text:`${t}${a}${a?`*`:``}i`,latex:`${t}${o}\\,i`}}let s=Se(e.re,t),c=e.im.sign===`-`?`-`:`+`;return{text:`${s.text} ${c} ${a}${a?`*`:``}i`,latex:`${s.latex} ${c} ${o}\\,i`}}function we(e,t=15){if(!Number.isFinite(e))return{sign:e<0?`-`:``,digits:Number.isNaN(e)?`nan`:`inf`,exp:0};if(e===0)return{sign:``,digits:`0`,exp:0};let[n,r]=Math.abs(e).toExponential(Math.min(Math.max(t,1),100)-1).split(`e`);return{sign:e<0?`-`:``,digits:n.replace(`.`,``).replace(/0+$/,``)||`0`,exp:Number(r)}}function U(e,t=10){return e==null?`—`:Number.isNaN(e)?`undef`:Se(we(e,t),{format:`normal`,fix:0,digits:t}).text}function Te(e){return{format:e.format,fix:e.fix,digits:e.digits}}function Ee(e,t){if(!e.ok)return{latex:null,text:``,error:e.error??`Error`};let n=Te(t),r=e.text??``,i=e.latex??``,a=e=>e.length>6e3?null:e,o=e.num??null,s=e.kind===`def`?void 0:e.kind;if(o&&(s===`value`||s===void 0)){let s=Ce(o,n,t.complex,t.angle),c=e.kind===`def`,l=c&&e.name?`${e.name} := `:``,u=c&&e.name?`${De(e.name)} := `:``;if(t.number===`decimal`||e.exact===!1)return{latex:u+s.latex,text:l+s.text};if(t.number===`fraction`)return{latex:a(i),text:r,mixedLatex:e.mixed_latex,...e.show_approx||/\\frac/.test(i)?{approxLatex:s.latex,approxText:s.text}:{}};let d=/^-?\d+$/.test(r.replace(/^[A-Za-z_]\w* := /,``));if(e.long&&d)return{latex:null,text:r,approxLatex:s.latex,approxText:s.text};let f=!d&&(e.show_approx||o.im!==null||/\\frac|\\sqrt|\\pi|e\^|\\log|\\operatorname|\\Gamma|\\zeta|\\sin|\\cos|\\tan|\\ln/.test(i)),p=t.complex===`polar`&&o.im!==null;return{latex:a(i),text:r,...f||p?{approxLatex:s.latex,approxText:s.text}:{}}}if(s===`quantity`&&o){let s=Ce(o,n,t.complex,t.angle),c=e.unit_latex??``,l=e.unit_text??``,u={latex:`${s.latex}\\,${c}`,text:`${s.text}*${l}`};if(t.number===`decimal`||e.exact===!1)return{latex:u.latex,text:u.text};let d=/^-?\d+$/.test(s.text)&&!/\\frac\{\d/.test(i.split(`\\,`)[0]??``);return{latex:a(i),text:r,...d?{}:{approxLatex:u.latex,approxText:u.text}}}return{latex:a(i),text:r,approxLatex:e.approx_latex,approxText:e.approx_text}}function De(e){let t=`alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi chi psi omega`.split(` `),[n,...r]=e.split(`_`),i=t.includes(n)?`\\${n}`:n.length>1?`\\mathrm{${n}}`:n;return r.length?`${i}_{${r.join(`\\_`)}}`:i}var W=(e,t)=>t.map(([t,n,r])=>({name:t,sig:n,desc:r,cat:e})),Oe=[...W(`Arithmetic`,[[`sqrt`,`sqrt(x)`,`Square root (√)`],[`cbrt`,`cbrt(x)`,`Real cube root`],[`root`,`root(x, n)`,`n-th root (real for odd n)`],[`abs`,`abs(x)`,`Absolute value, modulus`],[`sign`,`sign(x)`,`Sign: −1, 0 or 1`],[`floor`,`floor(x)`,`Largest integer ≤ x`],[`ceil`,`ceil(x)`,`Smallest integer ≥ x`],[`round`,`round(x, n)`,`Round to n decimals (half away from zero)`],[`trunc`,`trunc(x)`,`Integer part (towards zero)`],[`frac`,`frac(x)`,`Fractional part`],[`mod`,`mod(a, b)`,`Remainder of a ÷ b`],[`max`,`max(a, b, …)`,`Largest value (or of a list)`],[`min`,`min(a, b, …)`,`Smallest value (or of a list)`],[`approx`,`approx(x, n)`,`Decimal value with n digits`],[`exact`,`exact(x)`,`Exact form of a decimal (π, √2, fractions…)`],[`tofrac`,`tofrac(x, maxden)`,`Closest fraction`]]),...W(`Trigonometry`,[[`sin`,`sin(x)`,`Sine (in the angle unit)`],[`cos`,`cos(x)`,`Cosine`],[`tan`,`tan(x)`,`Tangent`],[`sec`,`sec(x)`,`Secant`],[`csc`,`csc(x)`,`Cosecant`],[`cot`,`cot(x)`,`Cotangent`],[`asin`,`asin(x)`,`Inverse sine`],[`acos`,`acos(x)`,`Inverse cosine`],[`atan`,`atan(x)`,`Inverse tangent`],[`atan2`,`atan2(y, x)`,`Angle of the point (x, y)`],[`sinh`,`sinh(x)`,`Hyperbolic sine`],[`cosh`,`cosh(x)`,`Hyperbolic cosine`],[`tanh`,`tanh(x)`,`Hyperbolic tangent`],[`asinh`,`asinh(x)`,`Inverse hyperbolic sine`],[`acosh`,`acosh(x)`,`Inverse hyperbolic cosine`],[`atanh`,`atanh(x)`,`Inverse hyperbolic tangent`],[`sinc`,`sinc(x)`,`sin(x)/x`]]),...W(`Exponential & log`,[[`exp`,`exp(x)`,`e to the power x`],[`ln`,`ln(x)`,`Natural logarithm`],[`log`,`log(x, b)`,`Logarithm: base 10, or base b`],[`log2`,`log2(x)`,`Base-2 logarithm`],[`lambertw`,`lambertw(x, k)`,`Lambert W (branch k)`]]),...W(`Complex`,[[`re`,`re(z)`,`Real part`],[`im`,`im(z)`,`Imaginary part`],[`arg`,`arg(z)`,`Argument (in the angle unit)`],[`conj`,`conj(z)`,`Complex conjugate`],[`polar`,`polar(r, θ)`,`r∠θ: the number with modulus r and argument θ`],[`cis`,`cis(θ)`,`cos θ + i sin θ`]]),...W(`Special functions`,[[`gamma`,`gamma(x)`,`Gamma function Γ`],[`lgamma`,`lgamma(x)`,`log Γ(x)`],[`digamma`,`digamma(x)`,`ψ(x) = Γ′/Γ`],[`polygamma`,`polygamma(n, x)`,`n-th derivative of ψ`],[`beta`,`beta(a, b)`,`Beta function B`],[`lowergamma`,`lowergamma(s, x)`,`Lower incomplete gamma γ`],[`uppergamma`,`uppergamma(s, x)`,`Upper incomplete gamma Γ`],[`erf`,`erf(x)`,`Error function`],[`erfc`,`erfc(x)`,`Complementary error function`],[`erfinv`,`erfinv(x)`,`Inverse error function`],[`besselj`,`besselj(n, x)`,`Bessel function Jₙ`],[`bessely`,`bessely(n, x)`,`Bessel function Yₙ`],[`besseli`,`besseli(n, x)`,`Modified Bessel Iₙ`],[`besselk`,`besselk(n, x)`,`Modified Bessel Kₙ`],[`jn`,`jn(n, x)`,`Spherical Bessel jₙ`],[`yn`,`yn(n, x)`,`Spherical Bessel yₙ`],[`airyai`,`airyai(x)`,`Airy Ai`],[`airybi`,`airybi(x)`,`Airy Bi`],[`zeta`,`zeta(s)`,`Riemann ζ`],[`polylog`,`polylog(s, z)`,`Polylogarithm Liₛ`],[`legendre`,`legendre(n, x)`,`Legendre polynomial Pₙ`],[`assoc_legendre`,`assoc_legendre(n, m, x)`,`Associated Legendre Pₙᵐ`],[`hermite`,`hermite(n, x)`,`Hermite polynomial Hₙ`],[`laguerre`,`laguerre(n, x)`,`Laguerre polynomial Lₙ`],[`chebyshevt`,`chebyshevt(n, x)`,`Chebyshev Tₙ`],[`chebyshevu`,`chebyshevu(n, x)`,`Chebyshev Uₙ`],[`Ynm`,`Ynm(n, m, θ, φ)`,`Spherical harmonic`],[`Ei`,`Ei(x)`,`Exponential integral`],[`Si`,`Si(x)`,`Sine integral`],[`Ci`,`Ci(x)`,`Cosine integral`],[`li`,`li(x)`,`Logarithmic integral`],[`fresnels`,`fresnels(x)`,`Fresnel S`],[`fresnelc`,`fresnelc(x)`,`Fresnel C`],[`ellipk`,`ellipk(m)`,`Complete elliptic integral K`],[`ellipe`,`ellipe(m)`,`Complete elliptic integral E`],[`hyper`,`hyper([a…], [b…], z)`,`Generalised hypergeometric pFq`],[`heaviside`,`heaviside(x)`,`Heaviside step`]]),...W(`Number theory`,[[`factorial`,`factorial(n)`,`n! (also written n!)`],[`nCr`,`nCr(n, k)`,`Combinations (binomial coefficient)`],[`nPr`,`nPr(n, k)`,`Permutations`],[`gcd`,`gcd(a, b, …)`,`Greatest common divisor`],[`lcm`,`lcm(a, b, …)`,`Least common multiple`],[`isprime`,`isprime(n)`,`Is n prime?`],[`nextprime`,`nextprime(n)`,`Next prime after n`],[`prevprime`,`prevprime(n)`,`Prime before n`],[`prime`,`prime(k)`,`The k-th prime`],[`primepi`,`primepi(n)`,`Number of primes ≤ n`],[`factor`,`factor(n)`,`Prime factorisation (or factor a polynomial)`],[`divisors`,`divisors(n)`,`All divisors`],[`totient`,`totient(n)`,`Euler φ`],[`powmod`,`powmod(a, b, m)`,`a^b mod m`],[`invmod`,`invmod(a, m)`,`Inverse of a modulo m`],[`fibonacci`,`fibonacci(n)`,`Fibonacci number`],[`bernoulli`,`bernoulli(n)`,`Bernoulli number`],[`digits`,`digits(n, b)`,`Digits of n in base b`]]),...W(`Algebra`,[[`simplify`,`simplify(e)`,`Simplify`],[`expand`,`expand(e)`,`Expand products and powers`],[`factor`,`factor(e)`,`Factor`],[`apart`,`apart(e, x)`,`Partial fractions`],[`together`,`together(e)`,`One fraction`],[`cancel`,`cancel(e)`,`Cancel common factors`],[`collect`,`collect(e, x)`,`Collect powers of x`],[`trigsimp`,`trigsimp(e)`,`Simplify trigonometry`],[`expand_trig`,`expand_trig(e)`,`Expand sin(a+b)…`],[`subs`,`subs(e, x = 2)`,`Substitute values`],[`numer`,`numer(e)`,`Numerator`],[`denom`,`denom(e)`,`Denominator`],[`coeffs`,`coeffs(p, x)`,`Polynomial coefficients`],[`degree`,`degree(p, x)`,`Polynomial degree`]]),...W(`Calculus`,[[`diff`,`diff(f, x, n)`,`n-th derivative (diff(f, x, 1, a) at x = a)`],[`nderiv`,`nderiv(f, x, a)`,`Numeric derivative at a`],[`integrate`,`integrate(f, x, a, b)`,`Integral (indefinite without a, b)`],[`nint`,`nint(f, x, a, b)`,`Numeric integral (any precision)`],[`limit`,`limit(f, x, a, "+")`,`Limit (one-sided with "+" or "-")`],[`series`,`series(f, x, a, n)`,`Series with O(…)`],[`taylor`,`taylor(f, x, a, n)`,`Taylor polynomial`],[`sum`,`sum(f, k, a, b)`,`Sum Σ (sum(list) adds a list)`],[`product`,`product(f, k, a, b)`,`Product Π`],[`dsolve`,`dsolve(y'' + y = 0, y(0) = 1)`,`Solve an ODE exactly`],[`odesolve`,`odesolve(f, t, y, t0, y0, t1)`,`Numeric ODE y' = f(t, y): y(t1)`]]),...W(`Equations`,[[`solve`,`solve(eq, x)`,`Solve equations (lists for systems)`],[`nsolve`,`nsolve(eq, x, x0)`,`Numeric root from a start value`],[`roots`,`roots(p, x)`,`All roots of a polynomial`],[`proots`,`proots([1, 0, -2])`,`Roots from coefficients`]]),...W(`Linear algebra`,[[`det`,`det(A)`,`Determinant`],[`inv`,`inv(A)`,`Inverse (also A^-1)`],[`transpose`,`transpose(A)`,`Transpose`],[`rank`,`rank(A)`,`Rank`],[`rref`,`rref(A)`,`Reduced row echelon form`],[`trace`,`trace(A)`,`Trace`],[`eigenvals`,`eigenvals(A)`,`Eigenvalues`],[`eig`,`eig(A)`,`Eigenvalues and eigenvectors`],[`lu`,`lu(A)`,`LU decomposition (P, L, U)`],[`qr`,`qr(A)`,`QR decomposition`],[`svd`,`svd(A)`,`Singular value decomposition`],[`cholesky`,`cholesky(A)`,`Cholesky factor`],[`linsolve`,`linsolve(A, b)`,`Solve A·x = b`],[`lstsq`,`lstsq(A, b)`,`Least-squares solution`],[`norm`,`norm(A, p)`,`Norm (2, 1, oo, "fro")`],[`cond`,`cond(A)`,`Condition number`],[`cross`,`cross(u, v)`,`Cross product`],[`dot`,`dot(u, v)`,`Dot product`],[`nullspace`,`nullspace(A)`,`Basis of the null space`],[`charpoly`,`charpoly(A)`,`Characteristic polynomial`],[`expm`,`expm(A)`,`Matrix exponential`],[`adj`,`adj(A)`,`Adjugate`],[`eye`,`eye(n)`,`Identity matrix`],[`zeros`,`zeros(m, n)`,`Zero matrix`],[`ones`,`ones(m, n)`,`Matrix of ones`],[`diag`,`diag(a, b, …)`,`Diagonal matrix`]]),...W(`Statistics`,[[`mean`,`mean(list)`,`Mean`],[`median`,`median(list)`,`Median`],[`mode`,`mode(list)`,`Most frequent values`],[`var`,`var(list)`,`Sample variance`],[`stdev`,`stdev(list)`,`Sample standard deviation`],[`pstdev`,`pstdev(list)`,`Population standard deviation`],[`quantile`,`quantile(list, q)`,`Quantile`],[`cov`,`cov(x, y)`,`Sample covariance`],[`corr`,`corr(x, y)`,`Correlation coefficient`]]),...W(`Distributions`,[[`normpdf`,`normpdf(x, μ, σ)`,`Normal density`],[`normcdf`,`normcdf(x, μ, σ)`,`Normal P(X ≤ x)`],[`invnorm`,`invnorm(p, μ, σ)`,`Normal quantile`],[`tpdf`,`tpdf(x, ν)`,`Student t density`],[`tcdf`,`tcdf(x, ν)`,`Student t P(T ≤ x)`],[`invt`,`invt(p, ν)`,`Student t quantile`],[`chi2pdf`,`chi2pdf(x, k)`,`χ² density`],[`chi2cdf`,`chi2cdf(x, k)`,`χ² P(X ≤ x)`],[`invchi2`,`invchi2(p, k)`,`χ² quantile`],[`fpdf`,`fpdf(x, d1, d2)`,`F density`],[`fcdf`,`fcdf(x, d1, d2)`,`F P(X ≤ x)`],[`invf`,`invf(p, d1, d2)`,`F quantile`],[`binompdf`,`binompdf(k, n, p)`,`Binomial P(X = k)`],[`binomcdf`,`binomcdf(k, n, p)`,`Binomial P(X ≤ k)`],[`poisspdf`,`poisspdf(k, λ)`,`Poisson P(X = k)`],[`poisscdf`,`poisscdf(k, λ)`,`Poisson P(X ≤ k)`],[`geompdf`,`geompdf(k, p)`,`Geometric P(X = k)`],[`exppdf`,`exppdf(x, λ)`,`Exponential density`],[`expcdf`,`expcdf(x, λ)`,`Exponential P(X ≤ x)`]]),...W(`Units & constants`,[[`convert`,`convert(e, _unit)`,`Convert (or write e ▶ _km/_h)`],[`const`,`const("electron mass")`,`Any CODATA constant by name (or #me)`]]),...W(`Bitwise`,[[`band`,`band(a, b)`,`Bitwise AND`],[`bor`,`bor(a, b)`,`Bitwise OR`],[`bxor`,`bxor(a, b)`,`Bitwise XOR`],[`bnot`,`bnot(a, bits)`,`Bitwise NOT in a word`],[`shl`,`shl(a, n)`,`Shift left`],[`shr`,`shr(a, n)`,`Shift right`]])],ke=[...new Set(Oe.map(e=>e.cat))];function Ae(e,t=8){if(!e)return[];let n=e.toLowerCase(),r=new Set,i=Oe.filter(e=>e.name.toLowerCase().startsWith(n)),a=[];for(let e of i.sort((e,t)=>e.name.length-t.name.length))if(!r.has(e.name)&&(r.add(e.name),a.push(e),a.length>=t))break;return a}function je(e,t){let n=t;for(;n>0&&/[A-Za-z0-9_]/.test(e[n-1]);)n--;let r=e.slice(n,t);return!/^[A-Za-z]/.test(r)||n>0&&(e[n-1]===`_`||e[n-1]===`#`)?{word:``,start:t}:{word:r,start:n}}var G=(e,t,n,r,i,a)=>({kind:e,label:t,insert:n,shift:r,alpha:i,title:a}),K=(e,t=e)=>({label:e,insert:t}),q=(e,t,n)=>({label:e,insert:t,title:n}),Me=[[{kind:`ctl`,label:`SHIFT`,action:`shift`,title:`Second functions (green)`},{kind:`ctl`,label:`ALPHA`,action:`alpha`,title:`Letters (amber)`},{kind:`ctl`,label:`◀`,action:`left`,shift:{label:`▲`,action:`up`,title:`Previous input`}},{kind:`ctl`,label:`▶`,action:`right`,shift:{label:`▼`,action:`down`,title:`Next input`}},{kind:`ctl`,label:`DEL`,action:`backspace`,shift:{label:`CLR`,action:`clear`,title:`Clear the line`}},{kind:`ctl`,label:`AC`,action:`clear`,shift:{label:`CLR ALL`,action:`clearAll`,title:`Clear the history`}}],[G(`fn`,`x²`,`^2`,q(`x³`,`^3`),K(`a`),`Square`),G(`fn`,`xʸ`,`^`,q(`ʸ√x`,`root(|, )`),K(`b`),`Power`),G(`fn`,`√`,`sqrt(|)`,q(`∛`,`cbrt(|)`),K(`c`),`Square root`),G(`fn`,`x⁻¹`,`^(-1)`,q(`x!`,`!`),K(`d`),`Inverse`),G(`fn`,`log`,`log(|)`,q(`10ˣ`,`10^(|)`),K(`f`),`Base-10 logarithm`),G(`fn`,`ln`,`ln(|)`,q(`eˣ`,`e^(|)`),K(`g`),`Natural logarithm`)],[G(`fn`,`sin`,`sin(|)`,q(`sin⁻¹`,`asin(|)`),K(`h`)),G(`fn`,`cos`,`cos(|)`,q(`cos⁻¹`,`acos(|)`),K(`j`)),G(`fn`,`tan`,`tan(|)`,q(`tan⁻¹`,`atan(|)`),K(`k`)),G(`fn`,`hyp`,`sinh(|)`,q(`cosh`,`cosh(|)`),K(`l`),`Hyperbolic sine`),G(`op`,`(`,`(`,q(`[`,`[`),K(`m`)),G(`op`,`)`,`)`,q(`]`,`]`),K(`n`))],[G(`fn`,`d/dx`,`diff(|, x)`,q(`d/dx|ₐ`,`nderiv(|, x, )`),K(`o`),`Derivative`),G(`fn`,`∫`,`integrate(|, x)`,q(`∫ₐᵇ`,`integrate(|, x, , )`),K(`p`),`Integral`),G(`fn`,`Σ`,`sum(|, k, 1, n)`,q(`Π`,`product(|, k, 1, n)`),K(`q`),`Sum`),G(`fn`,`lim`,`limit(|, x, 0)`,q(`series`,`series(|, x, 0, 6)`),K(`r`),`Limit`),G(`fn`,`solve`,`solve(|, x)`,q(`nsolve`,`nsolve(|, x, 0)`),K(`s`),`Solve an equation`),G(`op`,`=`,`=`,q(`:=`,` := `),K(`u`),`Equation (SHIFT: define)`)],[G(`num`,`7`,`7`,q(`∞`,`oo`),K(`v`)),G(`num`,`8`,`8`,q(`°`,`°`),K(`w`)),G(`num`,`9`,`9`,q(`nCr`,`nCr(|, )`),K(`z`)),G(`op`,`÷`,`/`,q(`mod`,`mod(|, )`),K(`α`,`alpha`)),G(`fn`,`π`,`pi`,q(`e`,`e`),K(`β`,`β`)),G(`fn`,`i`,`i`,q(`∠`,`∠`),K(`θ`,`θ`),`Imaginary unit (SHIFT: polar ∠)`)],[G(`num`,`4`,`4`,q(`abs`,`abs(|)`),K(`A`)),G(`num`,`5`,`5`,q(`round`,`round(|, 2)`),K(`B`)),G(`num`,`6`,`6`,q(`gcd`,`gcd(|, )`),K(`C`)),G(`op`,`×`,`*`,q(`·`,`*`),K(`λ`,`λ`)),G(`fn`,`x`,`x`,q(`t`,`t`),K(`X`)),G(`fn`,`y`,`y`,q(`z`,`z`),K(`Y`))],[G(`num`,`1`,`1`,q(`det`,`det(|)`),K(`D`)),G(`num`,`2`,`2`,q(`inv`,`inv(|)`),K(`E`)),G(`num`,`3`,`3`,q(`[[ ]]`,`[[|, ], [, ]]`),K(`F`)),G(`op`,`−`,`-`,q(`▶`,` ▶ _`),K(`μ`,`μ`)),G(`fn`,`,`,`, `,q(`;`,`, `),K(`σ`,`σ`)),G(`fn`,`unit`,`_`,q(`const`,`#`),K(`ω`,`ω`),`Unit (_m) — SHIFT: constant (#c)`)],[G(`num`,`0`,`0`,q(`ans`,`ans`),K(`ans2`,`ans2`)),G(`num`,`.`,`.`,q(`→`,` → `),K(`_`,`_`)),G(`num`,`×10ⁿ`,`e`,q(`%`,`/100`),K(`E`,`E`),`Times ten to the power`),G(`op`,`+`,`+`,q(`±`,`-`),K(`f(x)`,`f(x) := `)),{kind:`fn`,label:`ans`,insert:`ans`,shift:{label:`Ans²`,insert:`ans2`},alpha:{label:`ans3`,insert:`ans3`}},{kind:`exe`,label:`EXE`,action:`exe`,title:`Calculate (Enter)`,shift:{label:`≈`,action:`approx`,title:`Decimal value (Ctrl+Enter)`}}]];function Ne(e,t,n,r){let i=r.indexOf(`|`),a=e.slice(t,n);if(i<0)return{text:e.slice(0,t)+r+e.slice(n),cursor:t+r.length};let o=r.slice(0,i),s=r.slice(i+1);return{text:e.slice(0,t)+o+a+s+e.slice(n),cursor:t+o.length+a.length}}var Pe={number:`exact`,digits:12,format:`normal`,fix:4,angle:`rad`,complex:`rect`,base:16,bits:32,signed:!0},J=[`L1`,`L2`,`L3`,`L4`,`L5`,`L6`];function Fe(){return{L1:[],L2:[],L3:[],L4:[],L5:[],L6:[]}}function Ie(){return{format:`kcalc`,version:1,settings:{...Pe},history:[],defs:[],lists:Fe(),graphs:[],view:{xmin:-10,xmax:10,ymin:-7,ymax:7},program:`# Python with SymPy, mpmath, NumPy and SciPy.
# Functions defined here can be used in the calculator.
import sympy as sp

def f(x):
    return x**2 + 1

print(f(3))
`}}var Le=0;function Re(){return Le=(Le+1)%1e6,`${Date.now().toString(36)}${Le.toString(36)}${Math.random().toString(36).slice(2,6)}`}function ze(e,t=e.length){let n=[];for(let r=Math.min(t,e.length)-1;r>=0&&n.length<50;r--)e[r].answer.ok&&n.push(e[r].id);return n}function Be(e,t,n){return[...e.filter(e=>Ve(e)!==t),n]}function Ve(e){let t=/^\s*([A-Za-zͰ-Ͽ]\w*)\s*(\([^()]*\))?\s*:=/.exec(e);if(t)return t[1];let n=/(?:->|→|▶)\s*([A-Za-zͰ-Ͽ]\w*)\s*$/.exec(e);return n?n[1]:null}function He(e){let t=[];for(let n of e)t[t.length-1]!==n.input&&t.push(n.input);return t}function Y(e){return!!e&&typeof e==`object`&&!Array.isArray(e)}function Ue(e){let t;try{t=JSON.parse(e)}catch{throw Error(`This is not a kCalc session (.kcalc) file.`)}if(!Y(t)||t.format!==`kcalc`)throw Error(`This is not a kCalc session (.kcalc) file.`);if(typeof t.version==`number`&&t.version>1)throw Error(`This session was saved by a newer kCalc.`);let n=Ie(),r=Y(t.settings)?t.settings:{},i=(e,t,n)=>t.includes(e)?e:n,a={number:i(r.number,[`exact`,`decimal`,`fraction`],n.settings.number),digits:typeof r.digits==`number`?Math.max(1,Math.min(1e3,Math.round(r.digits))):n.settings.digits,format:i(r.format,[`normal`,`sci`,`eng`,`fix`],n.settings.format),fix:typeof r.fix==`number`?Math.max(0,Math.min(100,Math.round(r.fix))):n.settings.fix,angle:i(r.angle,[`deg`,`rad`,`grad`],n.settings.angle),complex:i(r.complex,[`rect`,`polar`],n.settings.complex),base:i(r.base,[2,8,10,16],n.settings.base),bits:i(r.bits,[8,16,32,64],n.settings.bits),signed:typeof r.signed==`boolean`?r.signed:n.settings.signed},o=Array.isArray(t.history)?t.history.filter(e=>Y(e)&&typeof e.input==`string`&&Y(e.answer)).slice(-400).map(e=>({id:typeof e.id==`string`?e.id:Re(),input:e.input,inputLatex:typeof e.inputLatex==`string`?e.inputLatex:void 0,answer:e.answer,mode:Y(e.mode)?e.mode:{number:a.number,angle:a.angle,digits:a.digits},time:typeof e.time==`number`?e.time:0})):[],s=Fe();if(Y(t.lists))for(let e of J){let n=t.lists[e];Array.isArray(n)&&(s[e]=n.map(e=>typeof e==`number`&&Number.isFinite(e)?e:null))}let c=Array.isArray(t.graphs)?t.graphs.filter(e=>Y(e)&&typeof e.expr==`string`).map(e=>({...e,id:typeof e.id==`string`?e.id:Re(),kind:i(e.kind,[`y`,`param`,`polar`,`implicit`,`ode`],`y`),visible:e.visible!==!1,color:typeof e.color==`string`?e.color:`#22b357`})):[],l=Y(t.view)?t.view:{},u=[`xmin`,`xmax`,`ymin`,`ymax`].every(e=>typeof l[e]==`number`&&Number.isFinite(l[e]))&&l.xmax>l.xmin&&l.ymax>l.ymin?l:n.view;return{format:`kcalc`,version:1,settings:a,history:o,defs:Array.isArray(t.defs)?t.defs.filter(e=>typeof e==`string`):[],lists:s,graphs:c,view:u,program:typeof t.program==`string`?t.program:n.program}}function We(e){return JSON.stringify({...e,history:e.history.slice(-400)},null,1)}function Ge(e){return e.map(e=>e.answer.ok?`${e.input}\n  = ${e.answer.text??``}`:`${e.input}\n  ! ${e.answer.error??`error`}`).join(`

`)}var Ke=e=>void navigator.clipboard?.writeText(e).catch(()=>{});function qe(e){let{bridge:t,settings:r,history:i,input:a,setInput:o,inputRef:s}=e,[c,l]=(0,z.useState)(null),[d,f]=(0,z.useState)(`normal`),[m,h]=(0,z.useState)(null),[g,_]=(0,z.useState)(null),[v,y]=(0,z.useState)(null),[b,x]=(0,z.useState)(`vars`),[S,C]=(0,z.useState)(``),w=(0,z.useRef)(null),T=(0,z.useRef)(``);(0,z.useEffect)(()=>{let e=a.trim();if(!e){l(null);return}let n=!0,o=setTimeout(()=>{t.call(`preview`,{src:e,settings:X(r),ans:ze(i)}).then(e=>{n&&e&&(e.ok?l({latex:e.latex??``,approx:e.approx??null}):l({latex:``,approx:null,error:e.error}))}).catch(()=>{})},140);return()=>{n=!1,clearTimeout(o)}},[a,r,t,i]),(0,z.useEffect)(()=>{let e=w.current;e&&(e.scrollTop=e.scrollHeight)},[i.length]);let E=(0,z.useMemo)(()=>He(i),[i]),D=(0,z.useMemo)(()=>{let e=new Map,t=0;for(let n=i.length-1;n>=0;n--)i[n].answer.ok&&e.set(i[n].id,++t);return e},[i]),O=(e,t=e.length)=>{o(e),requestAnimationFrame(()=>{let e=s.current;e&&(e.focus(),e.setSelectionRange(t,t))})},ee=e=>{let t=s.current,n=t?.selectionStart??a.length,r=t?.selectionEnd??a.length,o=a,c=n,l=r;!a&&/^[+*/^]/.test(e)&&i.some(e=>e.answer.ok)&&(o=`ans`,c=l=3);let u=Ne(o,c,l,e);O(u.text,u.cursor)},[k,A]=(0,z.useState)(!1),j=async(t=!1)=>{let n=a.trim();if(n&&!k){y(null),h(null),A(!0);try{let r=await e.evaluate(n,{approx:t});r&&r.answer.ok&&o(e=>e.trim()===n?``:e)}finally{A(!1)}}},M=t=>{let n=s.current,r=n?.selectionStart??a.length;switch(t){case`shift`:f(e=>e===`shift`?`normal`:`shift`);return;case`alpha`:f(e=>e===`alpha`?`normal`:`alpha`);return;case`left`:O(a,Math.max(0,r-1));break;case`right`:O(a,Math.min(a.length,r+1));break;case`backspace`:{let e=n?.selectionEnd??r;e>r?O(a.slice(0,r)+a.slice(e),r):r>0&&O(a.slice(0,r-1)+a.slice(r),r-1);break}case`clear`:O(``);break;case`clearAll`:e.clearHistory();break;case`exe`:j(!1);break;case`approx`:j(!0);break;case`up`:P(-1);break;case`down`:P(1)}d===`shift`&&f(`normal`)},N=e=>{let t=d===`shift`&&e.shift||d===`alpha`&&e.alpha||e;t.action?M(t.action):t.insert!==void 0&&(ee(t.insert),d===`shift`&&f(`normal`))},P=e=>{if(!E.length)return;let t=m;if(t===null){if(e>0)return;T.current=a,t=E.length}if(t+=e,t>=E.length){h(null),O(T.current);return}t=Math.max(0,t),h(t),O(E[t])},F=(t,n)=>{let{word:r,start:i}=je(t,n);if(r.length<2)return y(null);let a=[...e.vars.filter(e=>e.name.toLowerCase().startsWith(r.toLowerCase())&&e.name!==r).map(e=>({name:e.name,sig:e.kind===`func`?e.text.split(` = `)[0]:e.name,desc:e.text,cat:`Arithmetic`})),...Ae(r).filter(e=>e.name!==r)].slice(0,8);y(a.length?{items:a,sel:0,start:i}:null)},I=e=>{if(!v)return;let t=s.current?.selectionStart??a.length,n=/\(/.test(e.sig)?`${e.name}(|)`:e.name,r=Ne(a,v.start,t,n);y(null),O(r.text,r.cursor)},te=e=>{if(v){if(e.key===`ArrowDown`){e.preventDefault(),y({...v,sel:(v.sel+1)%v.items.length});return}if(e.key===`ArrowUp`){e.preventDefault(),y({...v,sel:(v.sel-1+v.items.length)%v.items.length});return}if(e.key===`Tab`){e.preventDefault(),I(v.items[v.sel]);return}if(e.key===`Escape`){e.preventDefault(),y(null);return}}e.key===`Enter`?(e.preventDefault(),j(e.ctrlKey||e.metaKey)):e.key===`ArrowUp`?(e.preventDefault(),P(-1)):e.key===`ArrowDown`?(e.preventDefault(),P(1)):e.key===`Escape`&&(e.preventDefault(),O(``))},ne=c?.approx?Ce(c.approx,{format:r.format,fix:r.fix,digits:Math.min(r.digits,15)},r.complex,r.angle):null,L=(0,z.useMemo)(()=>{let e=S.trim().toLowerCase();return e?Oe.filter(t=>t.name.toLowerCase().includes(e)||t.desc.toLowerCase().includes(e)):Oe},[S]);return(0,B.jsxs)(`div`,{className:`kc-calc`,children:[(0,B.jsxs)(`div`,{className:`kc-main`,children:[(0,B.jsxs)(`div`,{className:`kc-history`,ref:w,children:[!i.length&&(0,B.jsxs)(`div`,{className:`kc-welcome`,children:[(0,B.jsx)(p,{size:34}),(0,B.jsx)(`div`,{className:`kc-welcome-title`,children:`kCalc`}),(0,B.jsxs)(`div`,{className:`k-muted`,children:[`Type and press Enter. Try `,(0,B.jsx)(`code`,{children:`integrate(sin(x)^2, x)`}),`, `,(0,B.jsx)(`code`,{children:`solve(x^2 = 2, x)`}),`,`,` `,(0,B.jsx)(`code`,{children:`3_m/_s * 2_h`}),`, `,(0,B.jsx)(`code`,{children:`#h*#c/(500_nm) ▶ _eV`}),`, `,(0,B.jsx)(`code`,{children:`[[1,2],[3,4]]^-1`}),`, `,(0,B.jsx)(`code`,{children:`f(x) := x^2`}),`.`]})]}),i.map(t=>(0,B.jsx)(Je,{entry:t,n:D.get(t.id)??0,settings:r,editing:g?.id===t.id?g.text:null,onEdit:e=>_(e===null?null:{id:t.id,text:e}),onSubmitEdit:async n=>{_(null),await e.evaluate(n,{replaceId:t.id})},onReuse:()=>O(t.input),onInsert:e=>ee(e),onDelete:()=>e.deleteEntry(t.id)},t.id))]}),(0,B.jsxs)(`div`,{className:`kc-entry-area`,children:[(0,B.jsx)(`div`,{className:`kc-preview${c?.error?` error`:``}`,children:a.trim()?c?.latex?(0,B.jsxs)(B.Fragment,{children:[(0,B.jsx)(V,{tex:c.latex,className:`kc-preview-tex`}),ne&&(0,B.jsxs)(`span`,{className:`kc-preview-approx`,children:[`≈ `,ne.text]})]}):(0,B.jsx)(`span`,{className:`kc-preview-msg`,children:c?.error??` `}):(0,B.jsx)(`span`,{className:`kc-preview-msg k-muted`,children:`Enter: calculate · Ctrl+Enter: decimal · ↑↓: earlier inputs · Tab: complete`})}),(0,B.jsxs)(`div`,{className:`kc-line`,children:[(0,B.jsx)(`input`,{ref:s,className:`kc-input`,autoFocus:!0,value:a,spellCheck:!1,autoComplete:`off`,placeholder:`2x^2 + 3x - 5 = 0  ·  solve(…)  ·  ∫ …`,onChange:e=>{let t=e.target.value;!a&&/^[+*/^]$/.test(t)&&i.some(e=>e.answer.ok)&&(t=`ans`+t),o(t),h(null),F(t,e.target.selectionStart??t.length)},onKeyDown:te,onBlur:()=>setTimeout(()=>y(null),150),"aria-label":`Expression`}),(0,B.jsx)(`button`,{className:`k-btn primary kc-exe`,disabled:k||!a.trim(),onClick:()=>void j(!1),title:`Calculate (Enter)`,children:(0,B.jsx)(ce,{size:15})}),v&&(0,B.jsx)(`div`,{className:`kc-complete`,role:`listbox`,children:v.items.map((e,t)=>(0,B.jsxs)(`div`,{role:`option`,"aria-selected":t===v.sel,className:`kc-complete-item${t===v.sel?` sel`:``}`,onMouseDown:t=>{t.preventDefault(),I(e)},children:[(0,B.jsx)(`span`,{className:`kc-mono`,children:e.sig}),(0,B.jsx)(`span`,{className:`k-muted`,children:e.desc})]},e.name+t))})]}),e.showKeypad&&(0,B.jsx)(Ye,{layer:d,onKey:N})]})]}),e.showSide&&(0,B.jsxs)(`aside`,{className:`kc-side`,children:[(0,B.jsxs)(`div`,{className:`kc-side-tabs`,children:[(0,B.jsxs)(`button`,{className:b===`vars`?`active`:``,onClick:()=>x(`vars`),children:[(0,B.jsx)(ue,{size:14}),` Variables`]}),(0,B.jsxs)(`button`,{className:b===`catalog`?`active`:``,onClick:()=>x(`catalog`),children:[(0,B.jsx)(u,{size:14}),` Catalog`]})]}),b===`vars`?(0,B.jsxs)(`div`,{className:`kc-side-body`,children:[!e.vars.length&&(0,B.jsxs)(`div`,{className:`k-muted kc-side-hint`,children:[`Define with `,(0,B.jsx)(`code`,{children:`a := 5`}),`, `,(0,B.jsx)(`code`,{children:`f(x) := x^2 + 1`}),` or store with `,(0,B.jsx)(`code`,{children:`7 → b`}),`. Click a name to use it.`]}),e.vars.map(t=>(0,B.jsxs)(`div`,{className:`kc-var`,title:t.src??t.text,children:[(0,B.jsx)(`button`,{className:`kc-var-main`,onClick:()=>ee(t.kind===`func`?`${t.name}(|)`:t.name),children:(0,B.jsx)(V,{tex:t.latex.length>600?`\\text{${t.name}}`:t.latex})}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Delete ${t.name}`,onClick:()=>e.deleteVar(t.name),children:(0,B.jsx)(n,{size:13})})]},t.name)),e.vars.length>0&&(0,B.jsx)(`button`,{className:`k-btn small kc-side-clear`,onClick:e.clearVars,children:`Clear all variables`})]}):(0,B.jsxs)(`div`,{className:`kc-side-body`,children:[(0,B.jsx)(`input`,{className:`k-input kc-side-search`,placeholder:`Search functions…`,value:S,onChange:e=>C(e.target.value)}),ke.map(e=>{let t=L.filter(t=>t.cat===e);return t.length?(0,B.jsxs)(`div`,{className:`kc-cat`,children:[(0,B.jsx)(`div`,{className:`kc-cat-title`,children:e}),t.map(e=>(0,B.jsxs)(`button`,{className:`kc-cat-item`,title:e.desc,onClick:()=>ee(`${e.name}(|)`),children:[(0,B.jsx)(`span`,{className:`kc-mono`,children:e.sig}),(0,B.jsx)(`span`,{className:`k-muted`,children:e.desc})]},e.cat+e.name))]},e):null})]})]})]})}function X(e){return{number:e.number,digits:e.digits,angle:e.angle,complex:e.complex}}function Je(e){let{entry:t,settings:n}=e,r=(0,z.useMemo)(()=>Ee(t.answer,n),[t.answer,n]),i=/^[-+]?[\d.]+(e[-+]?\d+)?$/.test(r.text)&&r.text.length>60,a=r.text||t.answer.text||``;return(0,B.jsxs)(`div`,{className:`kc-entry${t.answer.ok?``:` error`}`,children:[e.editing===null?(0,B.jsx)(`button`,{className:`kc-entry-in`,title:`Click to use this input again`,onClick:e.onReuse,children:t.inputLatex&&t.inputLatex.length<3e3?(0,B.jsx)(V,{tex:t.inputLatex}):(0,B.jsx)(`span`,{className:`kc-mono`,children:t.input})}):(0,B.jsx)(`input`,{className:`kc-input kc-edit`,autoFocus:!0,value:e.editing,onChange:t=>e.onEdit(t.target.value),onKeyDown:t=>{t.key===`Enter`&&e.onSubmitEdit(e.editing??``),t.key===`Escape`&&e.onEdit(null)},onBlur:()=>e.onEdit(null)}),(0,B.jsx)(`div`,{className:`kc-entry-out`,children:r.error?(0,B.jsx)(`span`,{className:`kc-error`,children:r.error}):(0,B.jsxs)(B.Fragment,{children:[(0,B.jsx)(`button`,{className:`kc-result`,title:`ans${e.n} — click to insert`,onClick:()=>e.onInsert(`ans${e.n}`),children:r.latex!==null&&!i?(0,B.jsx)(V,{tex:r.latex,display:!0}):(0,B.jsx)(`span`,{className:`kc-mono kc-longnum`,children:r.text})}),r.mixedLatex&&(0,B.jsx)(`div`,{className:`kc-approx`,children:(0,B.jsx)(V,{tex:`= ${r.mixedLatex}`})}),r.approxLatex&&(0,B.jsx)(`div`,{className:`kc-approx`,children:r.approxLatex.length<3e3&&!/^[-+]?[\d.]{60,}/.test(r.approxText??``)?(0,B.jsx)(V,{tex:`\\approx ${r.approxLatex}`}):(0,B.jsxs)(`span`,{className:`kc-mono kc-longnum`,children:[`≈ `,r.approxText]})})]})}),(0,B.jsxs)(`div`,{className:`kc-entry-tools`,children:[e.n>0&&(0,B.jsxs)(`span`,{className:`kc-entry-n`,children:[`ans`,e.n]}),t.answer.ok&&(0,B.jsxs)(B.Fragment,{children:[(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Copy the result as text`,onClick:()=>Ke(a),children:(0,B.jsx)(I,{size:13})}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Copy the result as LaTeX`,onClick:()=>Ke(r.latex??t.answer.latex??a),children:(0,B.jsx)(h,{size:13})})]}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Edit and recalculate in place`,onClick:()=>e.onEdit(t.input),children:(0,B.jsx)(P,{size:13})}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Delete`,onClick:e.onDelete,children:(0,B.jsx)(M,{size:13})})]})]})}function Ye({layer:e,onKey:t}){return(0,B.jsx)(`div`,{className:`kc-keypad layer-${e}`,children:Me.map((n,r)=>(0,B.jsx)(`div`,{className:`kc-keyrow`,children:n.map((n,r)=>{let i=e===`shift`&&n.action===`shift`||e===`alpha`&&n.action===`alpha`,a=e===`shift`&&n.shift||e===`alpha`&&n.alpha||n;return(0,B.jsxs)(`button`,{className:`kc-key kind-${n.kind}${i?` on`:``}${n.action===`shift`?` shift`:``}${n.action===`alpha`?` alpha`:``}`,title:a.title??n.title??a.insert??a.label,onMouseDown:e=>e.preventDefault(),onClick:()=>t(n),children:[(0,B.jsxs)(`span`,{className:`kc-key-top`,children:[(0,B.jsx)(`span`,{className:`kc-key-shift`,children:n.shift?.label??``}),(0,B.jsx)(`span`,{className:`kc-key-alpha`,children:n.alpha?.label??``})]}),(0,B.jsx)(`span`,{className:`kc-key-main`,children:a.label})]},r)})},r))})}var Xe={xmin:-10,xmax:10,ymin:-7,ymax:7};function Ze(e,t,n=8){if(!(t>e)||!Number.isFinite(e)||!Number.isFinite(t))return{step:1,ticks:[]};let r=(t-e)/Math.max(1,n),i=10**Math.floor(Math.log10(r)),a=r/i,o=(a<1.5?1:a<3?2:a<7?5:10)*i,s=Math.ceil(e/o)*o,c=[];for(let e=s;e<=t+o*1e-9&&c.length<1e3;e+=o)c.push(Math.abs(e)<o*1e-9?0:e);return{step:o,ticks:c}}function Qe(e,t){if(e===0)return`0`;let n=Math.abs(e);if(n>=1e6||n<1e-4)return e.toExponential(Math.max(0,Math.min(6,-Math.floor(Math.log10(t))+Math.floor(Math.log10(n))))).replace(/\.?0+e/,`e`);let r=Math.max(0,Math.min(10,-Math.floor(Math.log10(t)+1e-9)));return e.toFixed(r)}function $e(e,t,n,r,i=r){return{xmin:t-(t-e.xmin)*r,xmax:t+(e.xmax-t)*r,ymin:n-(n-e.ymin)*i,ymax:n+(e.ymax-n)*i}}function et(e,t,n){return{xmin:e.xmin+t,xmax:e.xmax+t,ymin:e.ymin+n,ymax:e.ymax+n}}function tt(e,t,n){let r=(e.xmin+e.xmax)/2,i=(e.ymin+e.ymax)/2,a=Math.max((e.xmax-e.xmin)/t,(e.ymax-e.ymin)/n);return{xmin:r-a*t/2,xmax:r+a*t/2,ymin:i-a*n/2,ymax:i+a*n/2}}function nt(e,t){let n=e.flat().filter(e=>e!==null&&Number.isFinite(e));if(!n.length)return{ymin:t.ymin,ymax:t.ymax};n.sort((e,t)=>e-t);let r=n[Math.floor(n.length*.02)],i=n[Math.ceil(n.length*.98)-1];if(i-r<1e-12)return{ymin:r-1,ymax:i+1};let a=(i-r)*.08;return{ymin:r-a,ymax:i+a}}function rt(e,t,n){let r=[],i=[],a=n.ymax-n.ymin;for(let o=0;o<e.length;o++){let s=e[o],c=t[o];if(s===null||c===null||!Number.isFinite(s)||!Number.isFinite(c)){i.length&&r.push(i),i=[];continue}let l=i[i.length-1];if(l){let e=Math.abs(c-l[1]);(l[1]>n.ymax&&c<n.ymin||l[1]<n.ymin&&c>n.ymax||e>a*4)&&(r.push(i),i=[])}i.push([s,c])}return i.length&&r.push(i),r}function it(e,t,n){let r=[],i=(e,t,n,r)=>e+(t-e)*n/(n-r);for(let a=0;a+1<n.length;a++)for(let o=0;o+1<t.length;o++){let s=e[a]?.[o],c=e[a]?.[o+1],l=e[a+1]?.[o+1],u=e[a+1]?.[o];if(s==null||c==null||l==null||u==null)continue;let d=t[o],f=t[o+1],p=n[a],m=n[a+1],h=[];(s!==0||c!==0||l!==0||u!==0)&&(s<0!=c<0&&h.push([i(d,f,s,c),p]),c<0!=l<0&&h.push([f,i(p,m,c,l)]),u<0!=l<0&&h.push([i(d,f,u,l),m]),s<0!=u<0&&h.push([d,i(p,m,s,u)]),!(Math.max(Math.abs(s),Math.abs(c),Math.abs(l),Math.abs(u))>1e6&&Math.min(Math.abs(s),Math.abs(c),Math.abs(l),Math.abs(u))>1e3)&&(h.length===2?r.push([h[0][0],h[0][1],h[1][0],h[1][1]]):h.length===4&&((s+c+l+u)/4<0==s<0?r.push([h[0][0],h[0][1],h[1][0],h[1][1]],[h[2][0],h[2][1],h[3][0],h[3][1]]):r.push([h[0][0],h[0][1],h[3][0],h[3][1]],[h[1][0],h[1][1],h[2][0],h[2][1]]))))}return r}function at(e,t,n){return n<=1?[e]:Array.from({length:n},(r,i)=>e+(t-e)*i/(n-1))}function ot(e,t,n){let r=-1;for(let t=0;t+1<e.length;t++){let i=e[t],a=e[t+1];if(i!==null&&a!==null&&(i<=n&&n<=a||a<=n&&n<=i)){r=t;break}}if(r<0)return null;let i=e[r],a=e[r+1],o=t[r],s=t[r+1];if(o===null||s===null){let e=o??s;return e===null?null:{x:n,y:e}}let c=a===i?0:(n-i)/(a-i);return{x:n,y:o+(s-o)*c}}function st(e,t,n,r,i=1,a=1){let o=null,s=1/0;for(let c=0;c<e.length;c++){let l=e[c],u=t[c];if(l===null||u===null)continue;let d=((l-n)*i)**2+((u-r)*a)**2;d<s&&(s=d,o={x:l,y:u,i:c})}return o}var ct=[`#22b357`,`#3b82f6`,`#e8590c`,`#d6336c`,`#7c3aed`,`#0ea5a4`,`#ca8a04`,`#64748b`];function lt(e,t,n){return getComputedStyle(e).getPropertyValue(t).trim()||n}function ut({view:e,onView:t,layers:n,markers:r,trace:i,onPointer:a,onKeyDown:o,onSize:s,className:c}){let l=(0,z.useRef)(null),u=(0,z.useRef)(null),[d,f]=(0,z.useState)({w:0,h:0}),[p,m]=(0,z.useState)(0),[h,g]=(0,z.useState)(null),_=(0,z.useRef)(null),v=(0,z.useRef)({view:e,onView:t,onSize:s});v.current={view:e,onView:t,onSize:s},(0,z.useEffect)(()=>{let e=l.current;if(!e)return;let t=new ResizeObserver(()=>{let t=e.getBoundingClientRect(),n=Math.max(10,Math.floor(t.width)),r=Math.max(10,Math.floor(t.height));f(e=>e.w===n&&e.h===r?e:{w:n,h:r}),v.current.onSize?.(n,r)});return t.observe(e),()=>t.disconnect()},[]),(0,z.useEffect)(()=>{let e=l.current?.closest(`.k-window`)??document.documentElement,t=new MutationObserver(()=>m(e=>e+1));return t.observe(e,{attributes:!0,attributeFilter:[`style`,`data-dark`]}),e!==document.documentElement&&t.observe(document.documentElement,{attributes:!0,attributeFilter:[`style`,`data-dark`]}),()=>t.disconnect()},[]),(0,z.useEffect)(()=>{let e=l.current;if(!e)return;let t=t=>{let{view:n,onView:r}=v.current;if(!r)return;t.preventDefault();let i=e.getBoundingClientRect(),a=n.xmin+(t.clientX-i.left)/i.width*(n.xmax-n.xmin),o=n.ymax-(t.clientY-i.top)/i.height*(n.ymax-n.ymin),s=Math.exp(Math.sign(t.deltaY)*Math.min(.5,Math.abs(t.deltaY)/300));r(t.shiftKey?$e(n,a,o,s,1):t.altKey?$e(n,a,o,1,s):$e(n,a,o,s))};return e.addEventListener(`wheel`,t,{passive:!1}),()=>e.removeEventListener(`wheel`,t)},[]),(0,z.useEffect)(()=>{let t=u.current,a=l.current;if(!t||!a||!d.w)return;let o=window.devicePixelRatio||1;t.width=Math.round(d.w*o),t.height=Math.round(d.h*o);let s=t.getContext(`2d`);if(!s)return;s.setTransform(o,0,0,o,0,0);let c=lt(a,`--k-bg`,`#0d0f0e`),f=lt(a,`--k-text`,`#e9f1ec`),p=lt(a,`--k-muted`,`#8b998f`),m=lt(a,`--k-border`,`#252b28`),h=lt(a,`--k-font`,`sans-serif`),g=lt(a,`--k-mono`,`monospace`),_=d.w,v=d.h,{xmin:y,xmax:b,ymin:x,ymax:S}=e,C=e=>(e-y)/(b-y)*_,w=e=>v-(e-x)/(S-x)*v;s.fillStyle=c,s.fillRect(0,0,_,v),s.font=`11px ${h}`;let T=Ze(y,b,Math.max(2,Math.round(_/90))),E=Ze(x,S,Math.max(2,Math.round(v/70)));s.strokeStyle=m,s.lineWidth=1,s.beginPath();for(let e of T.ticks){let t=Math.round(C(e))+.5;s.moveTo(t,0),s.lineTo(t,v)}for(let e of E.ticks){let t=Math.round(w(e))+.5;s.moveTo(0,t),s.lineTo(_,t)}s.stroke();let D=Math.min(Math.max(w(0),0),v-1),O=Math.min(Math.max(C(0),0),_-1);s.strokeStyle=p,s.lineWidth=1.2,s.beginPath(),s.moveTo(0,Math.round(D)+.5),s.lineTo(_,Math.round(D)+.5),s.moveTo(Math.round(O)+.5,0),s.lineTo(Math.round(O)+.5,v),s.stroke(),s.fillStyle=p,s.textAlign=`center`,s.textBaseline=`top`;for(let e of T.ticks){if(e===0)continue;let t=C(e),n=D+4>v-14?D-16:D+4;s.fillText(Qe(e,T.step),t,n)}s.textAlign=`right`,s.textBaseline=`middle`;for(let e of E.ticks){if(e===0)continue;let t=w(e),n=O-4<30?O+34:O-4;s.fillText(Qe(e,E.step),n,t)}for(let t of n)if(s.strokeStyle=t.color,s.fillStyle=t.color,t.kind===`line`){s.lineWidth=t.width??2,s.setLineDash(t.dash??[]);for(let n of rt(t.xs,t.ys,e))s.beginPath(),n.forEach(([e,t],n)=>{let r=Math.max(-1e5,Math.min(1e5,w(t)));n?s.lineTo(C(e),r):s.moveTo(C(e),r)}),n.length===1&&s.arc(C(n[0][0]),w(n[0][1]),1.5,0,2*Math.PI),s.stroke();s.setLineDash([])}else if(t.kind===`segments`){s.lineWidth=t.width??2,s.beginPath();for(let[e,n,r,i]of t.segs)s.moveTo(C(e),w(n)),s.lineTo(C(r),w(i));s.stroke()}else if(t.kind===`scatter`){let e=t.r??3.5;for(let n=0;n<t.xs.length;n++)s.beginPath(),s.arc(C(t.xs[n]),w(t.ys[n]),e,0,2*Math.PI),s.fill()}else if(t.kind===`bars`){s.globalAlpha=.55;for(let e=0;e<t.heights.length;e++){let n=C(t.edges[e]),r=C(t.edges[e+1]),i=w(0),a=w(t.heights[e]);s.fillRect(n+1,Math.min(i,a),Math.max(1,r-n-2),Math.abs(a-i))}s.globalAlpha=1}else if(t.kind===`stems`){s.lineWidth=3;for(let e=0;e<t.xs.length;e++)s.globalAlpha=t.highlight&&!t.highlight(t.xs[e])?.35:1,s.beginPath(),s.moveTo(C(t.xs[e]),w(0)),s.lineTo(C(t.xs[e]),w(t.ys[e])),s.stroke();s.globalAlpha=1}else if(t.kind===`area`){s.globalAlpha=.28,s.beginPath();let e=!1,n=t.from;for(let r=0;r<t.xs.length;r++){let i=t.xs[r],a=t.ys[r];i===null||a===null||i<t.from||i>t.to||(e||=(s.moveTo(C(i),w(0)),!0),s.lineTo(C(i),w(a)),n=i)}e&&(s.lineTo(C(n),w(0)),s.closePath(),s.fill()),s.globalAlpha=1}for(let e of r??[]){let t=C(e.x),n=w(e.y);s.fillStyle=e.color??f,s.strokeStyle=c,s.lineWidth=2,s.beginPath(),s.arc(t,n,4.5,0,2*Math.PI),s.fill(),s.stroke(),e.label&&(s.fillStyle=f,s.textAlign=`left`,s.textBaseline=`bottom`,s.fillText(e.label,t+7,n-4))}if(i&&Number.isFinite(i.x)&&Number.isFinite(i.y)){let e=C(i.x),t=w(i.y);s.strokeStyle=i.color,s.setLineDash([4,4]),s.lineWidth=1,s.beginPath(),s.moveTo(e,0),s.lineTo(e,v),s.moveTo(0,t),s.lineTo(_,t),s.stroke(),s.setLineDash([]),s.fillStyle=i.color,s.beginPath(),s.arc(e,t,5,0,2*Math.PI),s.fill();let n=i.label??`(${i.x.toPrecision(6)}, ${i.y.toPrecision(6)})`;s.font=`12px ${g}`;let r=s.measureText(n).width+12,a=Math.min(_-r-4,e+10),o=Math.max(4,t-28);s.fillStyle=c,s.globalAlpha=.85,s.fillRect(a,o,r,20),s.globalAlpha=1,s.strokeStyle=i.color,s.strokeRect(a+.5,o+.5,r-1,19),s.fillStyle=f,s.textAlign=`left`,s.textBaseline=`middle`,s.fillText(n,a+6,o+10)}},[e,n,r,i,d,p]);let y=t=>{let n=l.current.getBoundingClientRect();return{x:e.xmin+(t.clientX-n.left)/n.width*(e.xmax-e.xmin),y:e.ymax-(t.clientY-n.top)/n.height*(e.ymax-e.ymin)}};return(0,B.jsxs)(`div`,{ref:l,className:`kc-plot ${c??``}`,tabIndex:0,onKeyDown:o,onPointerDown:n=>{t&&n.button===0&&(n.currentTarget.setPointerCapture(n.pointerId),_.current={px:n.clientX,py:n.clientY,view:e})},onPointerMove:e=>{let n=y(e);g(n),a?.(n);let r=_.current;if(r&&t){let n=l.current.getBoundingClientRect(),i=(e.clientX-r.px)/n.width*(r.view.xmax-r.view.xmin),a=(e.clientY-r.py)/n.height*(r.view.ymax-r.view.ymin);t(et(r.view,-i,a))}},onPointerUp:()=>_.current=null,onPointerLeave:()=>{g(null),a?.(null)},children:[(0,B.jsx)(`canvas`,{ref:u,style:{width:d.w||`100%`,height:d.h||`100%`}}),h&&(0,B.jsxs)(`div`,{className:`kc-plot-coords`,children:[`x = `,h.x.toPrecision(5),` · y = `,h.y.toPrecision(5)]})]})}var dt=[{id:`y`,label:`y = f(x)`},{id:`param`,label:`Parametric`},{id:`polar`,label:`Polar r(θ)`},{id:`implicit`,label:`Implicit F(x,y)`},{id:`ode`,label:`ODE y' = f(x,y)`}];function ft({bridge:e,settings:t,graphs:n,setGraphs:r,view:i,setView:a}){let[o,s]=(0,z.useState)({}),[c,l]=(0,z.useState)({w:800,h:500}),[u,d]=(0,z.useState)(n[0]?.id??null),[f,p]=(0,z.useState)(!1),[m,h]=(0,z.useState)(null),[_,b]=(0,z.useState)(null),[x,C]=(0,z.useState)(``),[w,T]=(0,z.useState)(null),[E,A]=(0,z.useState)(null),j=(0,z.useRef)(0),P=n.find(e=>e.id===u)??null,F=(0,z.useMemo)(()=>n.filter(e=>e.visible&&e.expr.trim()&&(e.kind!==`param`||e.expr2?.trim())),[n]),I=JSON.stringify([F.map(e=>[e.id,e.kind,e.expr,e.expr2,e.tmin,e.tmax,e.x0,e.y0]),i,c,t.angle]);(0,z.useEffect)(()=>{if(!F.length){s({});return}let n=++j.current,r=setTimeout(()=>{let r=F.map(e=>({kind:e.kind,expr:e.expr,expr2:e.expr2,tmin:e.tmin||`0`,tmax:e.tmax||(e.kind,`2*pi`),x0:e.x0||`0`,y0:e.y0||`1`,nx:Math.min(220,Math.round(c.w/5)),ny:Math.min(170,Math.round(c.h/5))}));e.call(`sample`,{items:r,xmin:i.xmin,xmax:i.xmax,ymin:i.ymin,ymax:i.ymax,n:Math.min(1400,Math.max(200,c.w)),settings:X(t)}).then(e=>{if(n!==j.current)return;if(!e.ok||!e.series){A(e.error??`Could not draw`);return}A(null);let t={};F.forEach((n,r)=>t[n.id]=e.series[r]),s(t)}).catch(()=>{})},60);return()=>clearTimeout(r)},[I,e]);let ne=(0,z.useMemo)(()=>{let e=[];for(let t of F){let n=o[t.id];if(!n||!n.ok)continue;let r=t.id===u?2.6:2;t.kind===`implicit`&&n.z&&n.nx&&n.ny?e.push({kind:`segments`,segs:it(n.z,at(i.xmin,i.xmax,n.nx),at(i.ymin,i.ymax,n.ny)),color:t.color,width:r}):n.x&&n.y&&e.push({kind:`line`,xs:n.x,ys:n.y,color:t.color,width:r})}return e},[F,o,u,i]),L=(e,t)=>r(n.map(n=>n.id===e?{...n,...t}:n)),re=(e=`y`)=>{let t=new Set(n.map(e=>e.color)),i=ct.find(e=>!t.has(e))??ct[n.length%ct.length],a={id:Re(),kind:e,color:i,visible:!0,expr:e===`y`?``:e===`param`?`cos(3t)`:e===`polar`?`1 + cos(theta)`:e===`implicit`?`x^2 + y^2 = 16`:`x - y`,expr2:e===`param`?`sin(2t)`:void 0,tmin:e===`param`||e===`polar`?`0`:void 0,tmax:e===`param`||e===`polar`?`2*pi`:void 0,x0:e===`ode`?`0`:void 0,y0:e===`ode`?`1`:void 0};r([...n,a]),d(a.id)},ie=(e,t)=>{if(!P)return null;let n=o[P.id];if(!n||!n.ok||!n.x||!n.y)return null;if(P.kind===`y`)return ot(n.x,n.y,e);let r=c.w/(i.xmax-i.xmin),a=c.h/(i.ymax-i.ymin);return st(n.x,n.y,e,t,r,a)},R=async r=>{if(!P||P.kind!==`y`){b({title:`Pick a y = f(x) graph first`,points:[]});return}let a=n.find(e=>e.id===x);if(r===`intersect`&&(!a||a.kind!==`y`)){b({title:`Choose the second y = f(x) graph to intersect with`,points:[]});return}try{let n=await e.call(`analyze`,{what:r,expr:P.expr,expr2:a?.expr,xmin:i.xmin,xmax:i.xmax,settings:X(t)});if(!n.ok)return b({title:n.error??`Failed`,points:[]});if(r===`integral`){b({title:`∫ from ${U(i.xmin,6)} to ${U(i.xmax,6)}`,points:[],value:n.text??U(n.value??NaN)});return}let o={roots:`Roots`,extrema:`Extrema`,intersect:`Intersections`}[r],s=(n.points??[]).map(e=>({x:e.x,y:e.y,color:P.color,label:e.type??void 0}));b({title:`${o} in view (${s.length})`,points:s})}catch(e){b({title:e instanceof Error?e.message:String(e),points:[]})}},ae=async(r,i)=>{let a=n.filter(e=>e.kind===`y`&&e.expr.trim());if(!a.length)return T({start:r,step:i,rows:null});let o=await e.call(`table`,{exprs:a.map(e=>e.expr),start:Number(r)||0,step:Number(i)||1,count:40,settings:X(t)});o.ok&&o.x&&o.cols&&T({start:r,step:i,rows:{x:o.x,cols:o.cols,names:a.map(e=>e.expr)}})},oe=(0,z.useMemo)(()=>_?.points??[],[_]),se=f&&m&&P?{...m,color:P.color}:null;return(0,B.jsxs)(`div`,{className:`kc-graph`,children:[(0,B.jsxs)(`div`,{className:`kc-graph-side`,children:[(0,B.jsxs)(`div`,{className:`kc-graph-list`,children:[n.map((e,t)=>(0,B.jsxs)(`div`,{className:`kc-gitem${e.id===u?` sel`:``}`,onClick:()=>d(e.id),children:[(0,B.jsxs)(`div`,{className:`kc-gitem-head`,children:[(0,B.jsx)(`input`,{type:`color`,className:`kc-swatch`,value:e.color,onChange:t=>L(e.id,{color:t.target.value}),title:`Colour`}),(0,B.jsx)(`select`,{className:`k-input kc-gkind`,value:e.kind,onChange:t=>L(e.id,{kind:t.target.value}),children:dt.map(e=>(0,B.jsx)(`option`,{value:e.id,children:e.label},e.id))}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:e.visible?`Hide`:`Show`,onClick:()=>L(e.id,{visible:!e.visible}),children:e.visible?(0,B.jsx)(y,{size:14}):(0,B.jsx)(v,{size:14})}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Remove`,onClick:()=>r(n.filter(t=>t.id!==e.id)),children:(0,B.jsx)(M,{size:14})})]}),(0,B.jsx)(pt,{g:e,n:t+1,onChange:t=>L(e.id,t)}),o[e.id]&&!o[e.id].ok&&(0,B.jsx)(`div`,{className:`kc-error small`,children:o[e.id].error})]},e.id)),(0,B.jsxs)(`div`,{className:`kc-gadd`,children:[(0,B.jsxs)(`button`,{className:`k-btn small`,onClick:()=>re(`y`),children:[(0,B.jsx)(te,{size:13}),` y = f(x)`]}),(0,B.jsxs)(`select`,{className:`k-input kc-gkind`,value:``,onChange:e=>e.target.value&&re(e.target.value),children:[(0,B.jsx)(`option`,{value:``,children:`More…`}),dt.slice(1).map(e=>(0,B.jsx)(`option`,{value:e.id,children:e.label},e.id))]})]})]}),(0,B.jsxs)(`div`,{className:`kc-panel`,children:[(0,B.jsxs)(`div`,{className:`kc-panel-title`,children:[`Analyse `,P?(0,B.jsx)(`span`,{className:`kc-dot`,style:{background:P.color}}):null]}),(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsx)(`button`,{className:`k-btn small`,onClick:()=>void R(`roots`),children:`Roots`}),(0,B.jsx)(`button`,{className:`k-btn small`,onClick:()=>void R(`extrema`),children:`Extrema`}),(0,B.jsx)(`button`,{className:`k-btn small`,onClick:()=>void R(`integral`),children:`∫ area`})]}),(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsx)(`button`,{className:`k-btn small`,onClick:()=>void R(`intersect`),children:`Intersect with`}),(0,B.jsxs)(`select`,{className:`k-input kc-gkind`,value:x,onChange:e=>C(e.target.value),children:[(0,B.jsx)(`option`,{value:``,children:`…`}),n.filter(e=>e.kind===`y`&&e.id!==u).map(e=>(0,B.jsx)(`option`,{value:e.id,children:e.expr||`(empty)`},e.id))]})]}),_&&(0,B.jsxs)(`div`,{className:`kc-found`,children:[(0,B.jsx)(`div`,{className:`k-muted`,children:_.title}),_.value&&(0,B.jsx)(`div`,{className:`kc-mono kc-found-value`,children:_.value}),_.points.map((e,t)=>(0,B.jsxs)(`button`,{className:`kc-found-row`,onClick:()=>{p(!0),h({x:e.x,y:e.y})},children:[(0,B.jsxs)(`span`,{className:`kc-mono`,children:[`x = `,U(e.x,10)]}),(0,B.jsxs)(`span`,{className:`kc-mono`,children:[`y = `,U(e.y,10)]}),e.label&&(0,B.jsx)(`span`,{className:`k-muted`,children:e.label})]},t))]})]}),(0,B.jsxs)(`div`,{className:`kc-panel`,children:[(0,B.jsx)(`div`,{className:`kc-panel-title`,children:`Window`}),(0,B.jsx)(`div`,{className:`kc-window-grid`,children:[`xmin`,`xmax`,`ymin`,`ymax`].map(e=>(0,B.jsxs)(`label`,{children:[(0,B.jsx)(`span`,{children:e}),(0,B.jsx)(mt,{value:i[e],onCommit:t=>{let n={...i,[e]:t};n.xmax>n.xmin&&n.ymax>n.ymin&&a(n)}})]},e))})]})]}),(0,B.jsxs)(`div`,{className:`kc-graph-main`,children:[(0,B.jsxs)(`div`,{className:`k-toolbar kc-graph-bar`,children:[(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Zoom in`,onClick:()=>a($e(i,(i.xmin+i.xmax)/2,(i.ymin+i.ymax)/2,.5)),children:(0,B.jsx)(ee,{size:16})}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Zoom out`,onClick:()=>a($e(i,(i.xmin+i.xmax)/2,(i.ymin+i.ymax)/2,2)),children:(0,B.jsx)(k,{size:16})}),(0,B.jsx)(`button`,{className:`k-btn small`,title:`Standard window`,onClick:()=>a(Xe),children:`Std`}),(0,B.jsx)(`button`,{className:`k-btn small`,title:`Trigonometric window`,onClick:()=>a({xmin:-2*Math.PI,xmax:2*Math.PI,ymin:-4,ymax:4}),children:`Trig`}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Equal scales (square)`,onClick:()=>a(tt(i,c.w,c.h)),children:(0,B.jsx)(D,{size:15})}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Fit y to the curves`,onClick:()=>{let e=Object.values(o).flatMap(e=>e.ok&&e.y?[e.y]:[]);a({...i,...nt(e,i)})},children:(0,B.jsx)(S,{size:15})}),(0,B.jsx)(`span`,{className:`k-sep`}),(0,B.jsx)(`button`,{className:`k-icon-btn${f?` active`:``}`,title:`Trace the selected graph (← → move)`,onClick:()=>p(!f),children:(0,B.jsx)(g,{size:16})}),(0,B.jsx)(`button`,{className:`k-icon-btn${w?` active`:``}`,title:`Table of values`,onClick:()=>w?T(null):void ae(`0`,`1`),children:(0,B.jsx)(O,{size:16})}),(0,B.jsx)(`span`,{className:`k-spacer`}),E&&(0,B.jsx)(`span`,{className:`kc-error small`,children:E}),t.angle!==`rad`&&(0,B.jsxs)(`span`,{className:`k-muted small`,children:[`trig in `,t.angle.toUpperCase()]})]}),(0,B.jsxs)(`div`,{className:`kc-graph-canvas`,children:[(0,B.jsx)(ut,{view:i,onView:a,layers:ne,markers:oe,trace:se,onSize:(e,t)=>l({w:e,h:t}),onPointer:e=>{if(!f||!e)return;let t=ie(e.x,e.y);t&&h({x:t.x,y:t.y})},onKeyDown:e=>{if(!f||!m||e.key!==`ArrowLeft`&&e.key!==`ArrowRight`)return;e.preventDefault();let t=(i.xmax-i.xmin)/200*(e.key===`ArrowLeft`?-1:1)*(e.shiftKey?10:1),n=ie(m.x+t,m.y);n&&h({x:n.x,y:n.y})}}),!n.length&&(0,B.jsx)(`div`,{className:`kc-graph-empty`,children:(0,B.jsxs)(`button`,{className:`k-btn primary`,onClick:()=>re(`y`),children:[(0,B.jsx)(te,{size:14}),` Add a function`]})})]}),w&&(0,B.jsxs)(`div`,{className:`kc-table-pane`,children:[(0,B.jsxs)(`div`,{className:`kc-table-bar`,children:[(0,B.jsxs)(`label`,{children:[`start `,(0,B.jsx)(mt,{value:Number(w.start)||0,onCommit:e=>void ae(String(e),w.step)})]}),(0,B.jsxs)(`label`,{children:[`step `,(0,B.jsx)(mt,{value:Number(w.step)||1,onCommit:e=>void ae(w.start,String(e))})]}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Close`,onClick:()=>T(null),children:(0,B.jsx)(N,{size:14})})]}),w.rows?(0,B.jsx)(`div`,{className:`kc-table-scroll`,children:(0,B.jsxs)(`table`,{className:`kc-table`,children:[(0,B.jsx)(`thead`,{children:(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`th`,{children:`x`}),w.rows.names.map((e,t)=>(0,B.jsx)(`th`,{children:e},t))]})}),(0,B.jsx)(`tbody`,{children:w.rows.x.map((e,t)=>(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:U(e,10)}),w.rows.cols.map((e,n)=>(0,B.jsx)(`td`,{children:Array.isArray(e)?U(e[t],10):`error`},n))]},t))})]})}):(0,B.jsx)(`div`,{className:`k-muted kc-pad`,children:`Add a y = f(x) graph to see its values.`})]})]})]})}function pt({g:e,n:t,onChange:n}){let r=(e,t,r,i=``)=>(0,B.jsxs)(`label`,{className:`kc-gfield`,children:[(0,B.jsx)(`span`,{className:`kc-glabel`,children:e}),(0,B.jsx)(`input`,{className:`k-input kc-mono`,value:t??``,placeholder:i,spellCheck:!1,onChange:e=>n({[r]:e.target.value})})]});switch(e.kind){case`y`:return r(`y${t} =`,e.expr,`expr`,`sin(x)/x`);case`param`:return(0,B.jsxs)(B.Fragment,{children:[r(`x(t) =`,e.expr,`expr`),r(`y(t) =`,e.expr2,`expr2`),(0,B.jsxs)(`div`,{className:`kc-grange`,children:[r(`t from`,e.tmin,`tmin`),r(`to`,e.tmax,`tmax`)]})]});case`polar`:return(0,B.jsxs)(B.Fragment,{children:[r(`r(θ) =`,e.expr,`expr`,`1 + cos(theta)`),(0,B.jsxs)(`div`,{className:`kc-grange`,children:[r(`θ from`,e.tmin,`tmin`),r(`to`,e.tmax,`tmax`)]})]});case`implicit`:return r(``,e.expr,`expr`,`x^2 + y^2 = 16`);case`ode`:return(0,B.jsxs)(B.Fragment,{children:[r(`y' =`,e.expr,`expr`,`x - y`),(0,B.jsxs)(`div`,{className:`kc-grange`,children:[r(`x₀`,e.x0,`x0`),r(`y(x₀)`,e.y0,`y0`)]})]})}}function mt({value:e,onCommit:t}){let[n,r]=(0,z.useState)(U(e,8));(0,z.useEffect)(()=>r(U(e,8)),[e]);let i=()=>{let i=Number(n.replace(/π|pi/g,String(Math.PI)));Number.isFinite(i)?t(i):r(U(e,8))};return(0,B.jsx)(`input`,{className:`k-input kc-num`,value:n,onChange:e=>r(e.target.value),onBlur:i,onKeyDown:e=>e.key===`Enter`&&i()})}var ht=[`A`,`B`,`C`,`D`,`F`,`G`,`M`,`v`,`b`],gt=[{label:`det`,f:e=>`det(${e})`},{label:`A⁻¹`,f:e=>`inv(${e})`,title:`Inverse`},{label:`Aᵀ`,f:e=>`transpose(${e})`,title:`Transpose`},{label:`rank`,f:e=>`rank(${e})`},{label:`trace`,f:e=>`trace(${e})`},{label:`rref`,f:e=>`rref(${e})`,title:`Reduced row echelon form`},{label:`eigenvalues`,f:e=>`eigenvals(${e})`},{label:`eigenvectors`,f:e=>`eig(${e})`},{label:`LU`,f:e=>`lu(${e})`},{label:`QR`,f:e=>`qr(${e})`},{label:`SVD`,f:e=>`svd(${e})`},{label:`Cholesky`,f:e=>`cholesky(${e})`},{label:`norm`,f:e=>`norm(${e})`},{label:`cond`,f:e=>`cond(${e})`},{label:`null space`,f:e=>`nullspace(${e})`},{label:`char. poly`,f:e=>`charpoly(${e})`},{label:`exp(A)`,f:e=>`expm(${e})`},{label:`A²`,f:e=>`${e}^2`}];function _t(e){let t=e.trim();if(!t.startsWith(`[[`)||!t.endsWith(`]]`))return null;let n=[],r=0,i=``,a=[];for(let e of t.slice(1,-1)){if(e===`[`&&(r++,r===1)){a=[],i=``;continue}if(e===`]`&&(r--,r===0)){a.push(i.trim()),n.push(a),i=``;continue}if(e===`,`&&r===1){a.push(i.trim()),i=``;continue}r>=1&&(i+=e)}return n.length?n:null}function vt(e){return`[`+e.map(e=>`[`+e.map(e=>e.trim()||`0`).join(`, `)+`]`).join(`, `)+`]`}function yt({settings:e,vars:t,evaluate:n,insertToCalc:r,busy:i}){let[a,o]=(0,z.useState)(`A`),[s,c]=(0,z.useState)([[`1`,`2`],[`3`,`4`]]),[l,u]=(0,z.useState)(`A*B`),[d,f]=(0,z.useState)(null),p=s.length,h=s[0]?.length??1,g=(0,z.useMemo)(()=>t.filter(e=>e.kind===`var`&&/= \[\[/.test(e.text)),[t]),_=(e,t)=>{e=Math.max(1,Math.min(12,e)),t=Math.max(1,Math.min(12,t)),c(Array.from({length:e},(e,n)=>Array.from({length:t},(e,t)=>s[n]?.[t]??`0`)))},v=(e,t,n)=>c(s.map((r,i)=>i===e?r.map((e,r)=>r===t?n:e):r)),y=vt(s),b=async e=>f(await n(e)),x=e=>{let t=_t(e.text.slice(e.text.indexOf(`=`)+1));t&&(o(e.name),c(t))},S=d?Ee(d.answer,e):null;return(0,B.jsxs)(`div`,{className:`kc-matrix`,children:[(0,B.jsxs)(`div`,{className:`kc-matrix-edit`,children:[(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`Name`,(0,B.jsx)(`select`,{className:`k-input kc-small-select`,value:a,onChange:e=>o(e.target.value),children:[...new Set([...ht,...g.map(e=>e.name)])].map(e=>(0,B.jsx)(`option`,{children:e},e))})]}),(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`Rows`,(0,B.jsx)(`input`,{className:`k-input kc-num`,type:`number`,min:1,max:12,value:p,onChange:e=>_(Number(e.target.value),h)})]}),(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`Columns`,(0,B.jsx)(`input`,{className:`k-input kc-num`,type:`number`,min:1,max:12,value:h,onChange:e=>_(p,Number(e.target.value))})]}),(0,B.jsx)(`button`,{className:`k-btn small`,onClick:()=>c(s.map((e,t)=>e.map((e,n)=>t===n?`1`:`0`))),children:`Identity`}),(0,B.jsx)(`button`,{className:`k-btn small`,onClick:()=>c(s.map(e=>e.map(()=>`0`))),children:`Zero`})]}),(0,B.jsx)(`div`,{className:`kc-mgrid`,style:{gridTemplateColumns:`repeat(${h}, minmax(52px, 90px))`},children:s.map((e,t)=>e.map((e,n)=>(0,B.jsx)(`input`,{className:`k-input kc-mcell`,value:e,spellCheck:!1,onChange:e=>v(t,n,e.target.value),onKeyDown:e=>{if(e.key===`Enter`){let r=e.currentTarget.parentElement?.children[(t*h+n+1)%(p*h)];r?.focus(),r?.select()}}},`${t}-${n}`)))}),(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsxs)(`button`,{className:`k-btn primary small`,disabled:i,onClick:()=>void b(`${a} := ${y}`),children:[(0,B.jsx)(T,{size:13}),` Store as `,a]}),(0,B.jsxs)(`button`,{className:`k-btn small`,onClick:()=>r(y),children:[(0,B.jsx)(m,{size:13}),` Insert in Calculate`]})]}),(0,B.jsxs)(`div`,{className:`kc-panel-title`,children:[`Operations on `,a]}),(0,B.jsx)(`div`,{className:`kc-ops`,children:gt.map(e=>(0,B.jsx)(`button`,{className:`k-btn small`,disabled:i,title:e.title??e.f(a),onClick:()=>void b(e.f(a)),children:e.label},e.label))}),(0,B.jsx)(`div`,{className:`kc-panel-title`,children:`Expression`}),(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsx)(`input`,{className:`k-input kc-mono`,value:l,onChange:e=>u(e.target.value),onKeyDown:e=>e.key===`Enter`&&void b(l),placeholder:`A*B, A^-1*b, linsolve(A, b), cross(u, v)…`}),(0,B.jsx)(`button`,{className:`k-btn small`,disabled:i,onClick:()=>void b(l),children:`=`})]}),g.length>0&&(0,B.jsxs)(B.Fragment,{children:[(0,B.jsx)(`div`,{className:`kc-panel-title`,children:`Stored`}),(0,B.jsx)(`div`,{className:`kc-stored`,children:g.map(e=>(0,B.jsx)(`button`,{className:`kc-stored-item`,title:`Edit`,onClick:()=>x(e),children:(0,B.jsx)(V,{tex:e.latex.length>1500?`\\text{${e.name}}`:e.latex})},e.name))})]})]}),(0,B.jsxs)(`div`,{className:`kc-matrix-result`,children:[(0,B.jsx)(`div`,{className:`kc-panel-title`,children:`Result`}),!d&&(0,B.jsx)(`div`,{className:`k-muted kc-pad`,children:`Store a matrix, then pick an operation. Every result is also in the Calculate history (as ans).`}),d&&(0,B.jsxs)(`div`,{className:`kc-mresult`,children:[(0,B.jsx)(`div`,{className:`k-muted kc-mono`,children:d.input}),S?.error?(0,B.jsx)(`div`,{className:`kc-error`,children:S.error}):(0,B.jsxs)(B.Fragment,{children:[S?.latex!==null&&S?.latex!==void 0?(0,B.jsx)(V,{tex:S.latex,display:!0}):(0,B.jsx)(`pre`,{className:`kc-mono`,children:S?.text}),S?.approxLatex&&(0,B.jsx)(V,{tex:`\\approx ${S.approxLatex}`,display:!0})]})]})]})]})}var bt=e=>e.filter(e=>typeof e==`number`&&Number.isFinite(e));function xt(e){let t=e.length;return t?t%2?e[(t-1)/2]:(e[t/2-1]+e[t/2])/2:NaN}function St(e,t){let n=e;t&&(n=[],e.forEach((e,r)=>{let i=Math.round(t[r]??1);for(let t=0;t<i;t++)n.push(e)}));let r=n.length;if(!r)throw Error(`The list is empty`);let i=[...n].sort((e,t)=>e-t),a=n.reduce((e,t)=>e+t,0),o=a/r,s=n.reduce((e,t)=>e+t*t,0),c=n.reduce((e,t)=>e+(t-o)**2,0),l=n.reduce((e,t)=>e+(t-o)**3,0),u=n.reduce((e,t)=>e+(t-o)**4,0),d=r>1?c/(r-1):NaN,f=Math.sqrt(d),p=Math.sqrt(c/r),m=Math.floor(r/2),h=r>1?xt(i.slice(0,m)):i[0],g=r>1?xt(i.slice(r-m)):i[0],_=new Map;for(let e of n)_.set(e,(_.get(e)??0)+1);let v=Math.max(..._.values()),y=v>1?[..._].filter(([,e])=>e===v).map(([e])=>e).sort((e,t)=>e-t):[],b=r>2&&c>0?r*Math.sqrt(r-1)/(r-2)*(l/c**1.5):NaN,x=r>3&&c>0?(r+1)*r*(r-1)/((r-2)*(r-3))*(u/(c*c))-3*(r-1)**2/((r-2)*(r-3)):NaN;return{n:r,sum:a,sum2:s,mean:o,sx:f,sigma:p,variance:d,min:i[0],q1:h,median:xt(i),q3:g,max:i[r-1],range:i[r-1]-i[0],iqr:g-h,mode:y,skewness:b,kurtosis:x,sem:f/Math.sqrt(r),cv:f/o}}function Ct(e,t){let n=[],r=[];for(let i=0;i<Math.min(e.length,t.length);i++){let a=e[i],o=t[i];typeof a==`number`&&typeof o==`number`&&Number.isFinite(a)&&Number.isFinite(o)&&(n.push(a),r.push(o))}return[n,r]}function wt(e,t){let n=e.length;if(n<2)throw Error(`Two pairs of values or more are needed`);let r=e.reduce((e,t)=>e+t,0),i=t.reduce((e,t)=>e+t,0),a=r/n,o=i/n,s=0,c=0,l=0;for(let r=0;r<n;r++)s+=(e[r]-a)**2,c+=(t[r]-o)**2,l+=(e[r]-a)*(t[r]-o);return{n,meanX:a,meanY:o,sumX:r,sumY:i,sumXY:e.reduce((e,n,r)=>e+n*t[r],0),sumX2:e.reduce((e,t)=>e+t*t,0),sumY2:t.reduce((e,t)=>e+t*t,0),sx:Math.sqrt(s/(n-1)),sy:Math.sqrt(c/(n-1)),cov:l/(n-1),r:l/Math.sqrt(s*c)}}var Tt=[{id:`linear`,label:`Linear`,form:`y = a + b·x`},{id:`quadratic`,label:`Quadratic`,form:`y = a + b·x + c·x²`},{id:`cubic`,label:`Cubic`,form:`y = a + b·x + c·x² + d·x³`},{id:`quartic`,label:`Quartic`,form:`y = a + … + e·x⁴`},{id:`exponential`,label:`Exponential`,form:`y = a·e^(b·x)`},{id:`logarithmic`,label:`Logarithmic`,form:`y = a + b·ln x`},{id:`power`,label:`Power`,form:`y = a·x^b`}];function Et(e,t){let n=t.length,r=e.map((e,n)=>[...e,t[n]]);for(let e=0;e<n;e++){let t=e;for(let i=e+1;i<n;i++)Math.abs(r[i][e])>Math.abs(r[t][e])&&(t=i);if(Math.abs(r[t][e])<1e-300)throw Error(`The fit is singular (too few distinct x values?)`);[r[e],r[t]]=[r[t],r[e]];for(let t=e+1;t<n;t++){let i=r[t][e]/r[e][e];for(let a=e;a<=n;a++)r[t][a]-=i*r[e][a]}}let i=Array(n).fill(0);for(let e=n-1;e>=0;e--){let t=r[e][n];for(let a=e+1;a<n;a++)t-=r[e][a]*i[a];i[e]=t/r[e][e]}return i}function Dt(e,t,n){if(e.length<=n)throw Error(`A degree-${n} fit needs ${n+1} points or more`);let r=e.reduce((e,t)=>e+t,0)/e.length,i=Math.max(...e.map(e=>Math.abs(e-r)))||1,a=e.map(e=>(e-r)/i),o=n+1,s=Array.from({length:o},()=>Array(o).fill(0)),c=Array(o).fill(0);for(let e=0;e<a.length;e++){let n=[1];for(let t=1;t<2*o;t++)n.push(n[t-1]*a[e]);for(let r=0;r<o;r++){c[r]+=n[r]*t[e];for(let e=0;e<o;e++)s[r][e]+=n[r+e]}}let l=Et(s,c),u=Array(o).fill(0);for(let e=0;e<o;e++){let t=l[e]/i**e,n=1;for(let i=0;i<=e;i++)u[i]+=t*n*(-r)**(e-i),n=n*(e-i)/(i+1)}return u}var Z=e=>Number.isFinite(e)?Math.abs(e)>=1e-4&&Math.abs(e)<1e10?String(Number(e.toPrecision(12))):e.toExponential(11).replace(/\.?0+e/,`e`):String(e),Ot=e=>Z(e).replace(/e([+-]?)(\d+)/,(e,t,n)=>`\\times 10^{${t===`-`?`-`:``}${Number(n)}}`);function kt(e,t,n){if(e.length<2)throw Error(`Two pairs of values or more are needed`);let r={linear:1,quadratic:2,cubic:3,quartic:4}[n],i,a,o,s,c=null;if(r){i=Dt(e,t,r),a=e=>i.reduce((t,n,r)=>t+n*e**r,0);let n=i.map((e,t)=>({c:e,k:t})).reverse();o=n.map(({c:e,k:t})=>`(${Z(e)})${t===0?``:t===1?`*x`:`*x^${t}`}`).join(` + `),s=n.map(({c:e,k:t},n)=>`${e<0?`-`:n?`+`:``} ${Ot(Math.abs(e))+(t===0?``:t===1?`x`:`x^{${t}}`)}`).join(` `),r===1&&(c=wt(e,t).r)}else if(n===`exponential`){let n=t.map((e,t)=>e>0?t:-1).filter(e=>e>=0);if(n.length<2)throw Error(`An exponential fit needs positive y values`);let r=n.map(t=>e[t]),l=n.map(e=>Math.log(t[e])),[u,d]=Dt(r,l,1);i=[Math.exp(u),d],a=e=>i[0]*Math.exp(i[1]*e),o=`(${Z(i[0])})*exp((${Z(d)})*x)`,s=`${Ot(i[0])}\\,e^{${Ot(d)}x}`,c=wt(r,l).r}else if(n===`logarithmic`){let n=e.map((e,t)=>e>0?t:-1).filter(e=>e>=0);if(n.length<2)throw Error(`A logarithmic fit needs positive x values`);let r=n.map(t=>Math.log(e[t])),l=n.map(e=>t[e]);i=Dt(r,l,1),a=e=>i[0]+i[1]*Math.log(e),o=`(${Z(i[0])}) + (${Z(i[1])})*ln(x)`,s=`${Ot(i[0])} ${i[1]<0?`-`:`+`} ${Ot(Math.abs(i[1]))}\\ln x`,c=wt(r,l).r}else{let n=e.map((e,n)=>e>0&&t[n]>0?n:-1).filter(e=>e>=0);if(n.length<2)throw Error(`A power fit needs positive x and y values`);let r=n.map(t=>Math.log(e[t])),l=n.map(e=>Math.log(t[e])),[u,d]=Dt(r,l,1);i=[Math.exp(u),d],a=e=>i[0]*e**i[1],o=`(${Z(i[0])})*x^(${Z(d)})`,s=`${Ot(i[0])}\\,x^{${Ot(d)}}`,c=wt(r,l).r}let l=t.reduce((e,t)=>e+t,0)/t.length,u=e.map((e,n)=>t[n]-a(e)),d=u.reduce((e,t)=>e+t*t,0),f=t.reduce((e,t)=>e+(t-l)**2,0);return{model:n,coeffs:i,r2:f>0?1-d/f:1,r:c,residuals:u,expr:o,latex:`y = ${s}`,predict:a}}function At(e,t){if(!e.length)return{edges:[],counts:[]};let n=t??Math.max(1,Math.ceil(Math.log2(e.length)+1)),r=Math.min(...e),i=Math.max(...e);r===i&&(r-=.5,i+=.5);let a=(i-r)/n,o=Array.from({length:n+1},(e,t)=>r+t*a),s=Array(n).fill(0);for(let t of e)s[Math.min(n-1,Math.floor((t-r)/a))]++;return{edges:o,counts:s}}var jt=[{id:`normal`,label:`Normal`,params:[[`μ`,0],[`σ`,1]]},{id:`t`,label:`Student t`,params:[[`ν`,10]]},{id:`chi2`,label:`χ²`,params:[[`k`,4]]},{id:`f`,label:`F`,params:[[`d₁`,5],[`d₂`,10]]},{id:`exponential`,label:`Exponential`,params:[[`λ`,1]]},{id:`uniform`,label:`Uniform`,params:[[`a`,0],[`b`,1]]},{id:`gamma`,label:`Gamma`,params:[[`k`,2],[`θ`,1]]},{id:`beta`,label:`Beta`,params:[[`α`,2],[`β`,5]]},{id:`lognormal`,label:`Log-normal`,params:[[`μ`,0],[`σ`,1]]},{id:`weibull`,label:`Weibull`,params:[[`k`,1.5],[`λ`,1]]},{id:`cauchy`,label:`Cauchy`,params:[[`x₀`,0],[`γ`,1]]},{id:`binomial`,label:`Binomial`,params:[[`n`,10],[`p`,.5]],discrete:!0},{id:`poisson`,label:`Poisson`,params:[[`λ`,3]],discrete:!0},{id:`geometric`,label:`Geometric`,params:[[`p`,.3]],discrete:!0},{id:`hypergeometric`,label:`Hypergeometric`,params:[[`M`,50],[`n`,10],[`N`,12]],discrete:!0},{id:`negbinomial`,label:`Negative binomial`,params:[[`r`,5],[`p`,.5]],discrete:!0}],Mt=[{id:`t1`,label:`One-sample t-test`,needs:[`a`,`mu0`]},{id:`z1`,label:`One-sample z-test (σ known)`,needs:[`a`,`mu0`,`sigma`]},{id:`t2`,label:`Two-sample t-test`,needs:[`a`,`b`,`pooled`]},{id:`paired`,label:`Paired t-test`,needs:[`a`,`b`]},{id:`prop1`,label:`One-proportion z-test`,needs:[`prop`]},{id:`chi2gof`,label:`χ² goodness of fit (observed, expected)`,needs:[`a`,`b`]},{id:`chi2ind`,label:`χ² independence (lists = columns)`,needs:[`table`]},{id:`anova`,label:`One-way ANOVA (lists = groups)`,needs:[`table`]},{id:`linreg`,label:`Linear regression t-test (x, y)`,needs:[`a`,`b`]},{id:`normality`,label:`Shapiro–Wilk normality`,needs:[`a`]}];function Nt({bridge:e,settings:t,lists:n,setLists:i,evaluate:o,addGraph:s}){let[c,l]=(0,z.useState)({}),[u,d]=(0,z.useState)(`1var`),[f,p]=(0,z.useState)({list:`L1`,freq:``}),[m,h]=(0,z.useState)({x:`L1`,y:`L2`,model:`linear`,name:`freg`}),[g,v]=(0,z.useState)({id:`normal`,params:[0,1],fn:`cdf`,x:`1.96`}),[y,b]=(0,z.useState)(null),[x,S]=(0,z.useState)({id:`t1`,a:`L1`,b:`L2`,mu0:`0`,sigma:`1`,alt:`two-sided`,level:`0.95`,pooled:!1,successes:`45`,n:`100`,p0:`0.5`,table:[`L1`,`L2`]}),[C,w]=(0,z.useState)(null),D=Math.max(14,...J.map(e=>n[e].length+1)),O=(e,t,r)=>{let a=r.trim(),o=a===``?null:Number(a.replace(`,`,`.`)),s=[...n[e]];for(;s.length<=t;)s.push(null);for(s[t]=o===null||Number.isFinite(o)?o:s[t];s.length&&s[s.length-1]===null;)s.pop();i({...n,[e]:s})},ee=(e,t,r)=>{let a=r.clipboardData.getData(`text`);if(!/[\n\t]/.test(a.trim()))return;r.preventDefault();let o=a.trim().split(/\r?\n/).map(e=>e.split(/\t|;|,(?=\s*[-\d.])/)),s={...n},c=J.indexOf(e);o.forEach((e,n)=>e.forEach((e,r)=>{let i=J[c+r];if(!i)return;let a=[...s[i]];for(;a.length<=t+n;)a.push(null);let o=Number(e.trim());a[t+n]=e.trim()===``||!Number.isFinite(o)?null:o,s[i]=a})),i(s)},k=async a=>{let o=await r.dialog.prompt(`A formula of the other lists, row by row (e.g. L1^2 or 2*L1 + 1), or a sequence: seq(k^2, k, 1, 10).`,{title:`Fill ${a}`,defaultValue:a===`L1`?`seq(k, k, 1, 10)`:`L1^2`});if(!o?.trim())return;let s=/^\s*seq\((.*),\s*([A-Za-z]\w*)\s*,\s*([^,]+),\s*([^,]+?)(?:,\s*([^,]+))?\)\s*$/.exec(o),c=s?{expr:s[1],var:s[2],start:Number(s[3]),stop:Number(s[4]),step:s[5]?Number(s[5]):1}:{expr:o};if(s&&![c.start,c.stop,c.step].every(e=>Number.isFinite(e)))return void r.notify({title:`kCalc`,body:`seq needs numbers for its start, stop and step.`});try{let o=await e.call(`fill`,{...c,settings:X(t)});if(!o.ok||!o.values)return void r.notify({title:`kCalc`,body:o.error??`The formula gave no values.`});i({...n,[a]:o.values})}catch(e){r.notify({title:`kCalc`,body:e instanceof Error?e.message:String(e)})}},A=(0,z.useMemo)(()=>{try{let e=bt(n[f.list]);return e.length?{s:St(e,f.freq?n[f.freq].slice(0,n[f.list].length).map(e=>e??1):void 0),xs:e}:null}catch(e){return{error:e instanceof Error?e.message:String(e)}}},[n,f]),j=(0,z.useMemo)(()=>{let[e,t]=Ct(n[m.x],n[m.y]);if(!e.length)return null;try{return{fit:kt(e,t,m.model),X:e,Y:t}}catch(e){return{error:e instanceof Error?e.message:String(e)}}},[n,m.x,m.y,m.model]);(0,z.useEffect)(()=>{if(u!==`dist`)return;let t=setTimeout(()=>{let t=Number(g.x);if(!Number.isFinite(t))return b({error:`x must be a number`});e.call(`dist`,{name:g.id,fn:g.fn,x:t,params:g.params}).then(e=>b(e.ok?e:{error:e.error})).catch(()=>{})},120);return()=>clearTimeout(t)},[g,u,e]);let M=async()=>{let t=Mt.find(e=>e.id===x.id),r={a:bt(n[x.a]),b:bt(n[x.b])};t.needs.includes(`table`)&&(r.table=x.table.map(e=>bt(n[e])));let i=await e.call(`test`,{kind:x.id,data:r,opts:{mu0:Number(x.mu0),sigma:Number(x.sigma),alternative:x.alt,level:Number(x.level),pooled:x.pooled,successes:Number(x.successes),n:Number(x.n),p0:Number(x.p0)}});w(i)},N=(0,z.useMemo)(()=>{let e=(e,t)=>{let n=(t-e||Math.abs(t)||1)*.08;return[e-n,t+n]};if(u===`1var`&&A&&`s`in A&&A.xs.length){let t=At(A.xs),[n,r]=e(t.edges[0],t.edges[t.edges.length-1]);return{layers:[{kind:`bars`,edges:t.edges,heights:t.counts,color:`#22b357`}],view:{xmin:n,xmax:r,ymin:-Math.max(...t.counts)*.06,ymax:Math.max(...t.counts)*1.15}}}if((u===`reg`||u===`test`)&&j&&`fit`in j){let{X:t,Y:n,fit:r}=j,[i,a]=e(Math.min(...t),Math.max(...t)),o=at(i,a,300),s=o.map(e=>{let t=r.predict(e);return Number.isFinite(t)?t:null}),[c,l]=e(Math.min(...n),Math.max(...n));return{layers:[{kind:`line`,xs:o,ys:s,color:`#3b82f6`,width:2},{kind:`scatter`,xs:t,ys:n,color:`#22b357`}],view:{xmin:i,xmax:a,ymin:c,ymax:l}}}if(u===`dist`&&y?.curve){let t=y.curve,n=t.y.map(e=>e??0),r=Math.max(...n)*1.15||1,[i,a]=e(Math.min(...t.x),Math.max(...t.x)),o=g.fn===`inv`?y.value??0:Number(g.x),s=[],c=g.fn===`sf`?o:-1/0,l=g.fn===`sf`?1/0:o;return t.discrete?s.push({kind:`stems`,xs:t.x,ys:n,color:`#22b357`,highlight:g.fn===`pdf`?e=>e===o:e=>e>=c&&e<=l}):(g.fn!==`pdf`&&s.push({kind:`area`,xs:t.x,ys:t.y,color:`#22b357`,from:c,to:l}),s.push({kind:`line`,xs:t.x,ys:t.y,color:`#22b357`,width:2})),{layers:s,view:{xmin:i,xmax:a,ymin:-r*.05,ymax:r}}}return null},[u,A,j,y,g.fn,g.x]),P=jt.find(e=>e.id===g.id),F=Mt.find(e=>e.id===x.id),I=(e,t,r=!1)=>(0,B.jsxs)(`select`,{className:`k-input kc-small-select`,value:e,onChange:e=>t(e.target.value),children:[r&&(0,B.jsx)(`option`,{value:``,children:`—`}),J.map(e=>(0,B.jsxs)(`option`,{value:e,children:[e,` (`,bt(n[e]).length,`)`]},e))]});return(0,B.jsxs)(`div`,{className:`kc-stats`,children:[(0,B.jsx)(`div`,{className:`kc-lists`,children:(0,B.jsxs)(`table`,{className:`kc-table kc-list-table`,children:[(0,B.jsx)(`thead`,{children:(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`th`,{className:`kc-rownum`,children:`#`}),J.map(e=>(0,B.jsxs)(`th`,{children:[(0,B.jsx)(`span`,{children:e}),(0,B.jsx)(`button`,{className:`k-icon-btn kc-th-btn`,title:`Fill ${e} with a formula`,onClick:()=>void k(e),children:(0,B.jsx)(E,{size:12})}),(0,B.jsx)(`button`,{className:`k-icon-btn kc-th-btn`,title:`Clear ${e}`,onClick:()=>i({...n,[e]:[]}),children:(0,B.jsx)(_,{size:12})})]},e))]})}),(0,B.jsx)(`tbody`,{children:Array.from({length:D},(e,t)=>(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{className:`kc-rownum`,children:t+1}),J.map(e=>{let r=`${e}:${t}`,i=n[e][t];return(0,B.jsx)(`td`,{children:(0,B.jsx)(`input`,{className:`kc-cell`,value:c[r]??(i==null?``:String(i)),onChange:e=>l({...c,[r]:e.target.value}),onBlur:()=>{if(r in c){O(e,t,c[r]);let{[r]:n,...i}=c;l(i)}},onPaste:n=>ee(e,t,n),onKeyDown:t=>{if(t.key===`Enter`||t.key===`ArrowDown`||t.key===`ArrowUp`){t.preventDefault();let n=t.currentTarget.closest(`tr`),r=t.key===`ArrowUp`?n?.previousElementSibling:n?.nextElementSibling,i=J.indexOf(e)+1;(r?.children[i]?.querySelector(`input`))?.focus()}}})},e)})]},t))})]})}),(0,B.jsxs)(`div`,{className:`kc-stats-right`,children:[(0,B.jsx)(`div`,{className:`kc-subtabs`,children:[[`1var`,`One variable`],[`reg`,`Regression`],[`dist`,`Distributions`],[`test`,`Tests`]].map(([e,t])=>(0,B.jsx)(`button`,{className:u===e?`active`:``,onClick:()=>d(e),children:t},e))}),(0,B.jsxs)(`div`,{className:`kc-stats-body`,children:[u===`1var`&&(0,B.jsxs)(B.Fragment,{children:[(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`List `,I(f.list,e=>p({...f,list:e}))]}),(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`Frequencies `,I(f.freq,e=>p({...f,freq:e}),!0)]})]}),A&&`error`in A&&(0,B.jsx)(`div`,{className:`kc-error`,children:A.error}),A&&`s`in A&&(0,B.jsx)(`table`,{className:`kc-kv`,children:(0,B.jsxs)(`tbody`,{children:[[[`n`,A.s.n],[`x̄ (mean)`,A.s.mean],[`Σx`,A.s.sum],[`Σx²`,A.s.sum2],[`sx (sample sd)`,A.s.sx],[`σx (population sd)`,A.s.sigma],[`s² (variance)`,A.s.variance],[`SE of mean`,A.s.sem],[`min`,A.s.min],[`Q1`,A.s.q1],[`median`,A.s.median],[`Q3`,A.s.q3],[`max`,A.s.max],[`range`,A.s.range],[`IQR`,A.s.iqr],[`skewness`,A.s.skewness],[`excess kurtosis`,A.s.kurtosis],[`CV`,A.s.cv]].map(([e,t])=>(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:e}),(0,B.jsx)(`td`,{className:`kc-mono`,children:U(t,10)})]},e)),(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:`mode`}),(0,B.jsx)(`td`,{className:`kc-mono`,children:A.s.mode.length?A.s.mode.map(e=>U(e,10)).join(`, `):`none`})]})]})}),!A&&(0,B.jsx)(`div`,{className:`k-muted kc-pad`,children:`Type or paste numbers in a list.`})]}),u===`reg`&&(0,B.jsxs)(B.Fragment,{children:[(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`x `,I(m.x,e=>h({...m,x:e}))]}),(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`y `,I(m.y,e=>h({...m,y:e}))]}),(0,B.jsx)(`select`,{className:`k-input kc-small-select`,value:m.model,onChange:e=>h({...m,model:e.target.value}),children:Tt.map(e=>(0,B.jsxs)(`option`,{value:e.id,children:[e.label,`: `,e.form]},e.id))})]}),j&&`error`in j&&(0,B.jsx)(`div`,{className:`kc-error`,children:j.error}),j&&`fit`in j&&(0,B.jsxs)(B.Fragment,{children:[(0,B.jsx)(`div`,{className:`kc-fit`,children:(0,B.jsx)(V,{tex:j.fit.latex,display:!0})}),(0,B.jsx)(`table`,{className:`kc-kv`,children:(0,B.jsxs)(`tbody`,{children:[j.fit.coeffs.map((e,t)=>(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:[`a`,`b`,`c`,`d`,`e`][t]}),(0,B.jsx)(`td`,{className:`kc-mono`,children:U(e,12)})]},t)),(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:`R²`}),(0,B.jsx)(`td`,{className:`kc-mono`,children:U(j.fit.r2,10)})]}),j.fit.r!==null&&(0,B.jsxs)(`tr`,{children:[(0,B.jsxs)(`td`,{children:[`r `,m.model===`linear`?``:`(linearised)`]}),(0,B.jsx)(`td`,{className:`kc-mono`,children:U(j.fit.r,10)})]}),(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:`n`}),(0,B.jsx)(`td`,{className:`kc-mono`,children:j.X.length})]})]})}),(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsxs)(`button`,{className:`k-btn small`,onClick:()=>s(j.fit.expr),children:[(0,B.jsx)(a,{size:13}),` Graph it`]}),(0,B.jsx)(`input`,{className:`k-input kc-num`,value:m.name,onChange:e=>h({...m,name:e.target.value.replace(/[^\w]/g,``)})}),(0,B.jsxs)(`button`,{className:`k-btn small`,onClick:()=>void o(`${m.name||`freg`}(x) := ${j.fit.expr}`),children:[(0,B.jsx)(T,{size:13}),` Store as `,m.name||`freg`,`(x)`]})]})]}),!j&&(0,B.jsx)(`div`,{className:`k-muted kc-pad`,children:`Put x values in one list and y values in another.`})]}),u===`dist`&&(0,B.jsxs)(B.Fragment,{children:[(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsx)(`select`,{className:`k-input kc-small-select`,value:g.id,onChange:e=>{let t=jt.find(t=>t.id===e.target.value);v({...g,id:t.id,params:t.params.map(([,e])=>e),x:t.discrete?`3`:g.x})},children:jt.map(e=>(0,B.jsx)(`option`,{value:e.id,children:e.label},e.id))}),P.params.map(([e],t)=>(0,B.jsxs)(`label`,{className:`kc-inline`,children:[e,(0,B.jsx)(`input`,{className:`k-input kc-num`,value:String(g.params[t]??``),onChange:e=>{let n=[...g.params];n[t]=Number(e.target.value),v({...g,params:n})}})]},e))]}),(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsxs)(`select`,{className:`k-input kc-small-select`,value:g.fn,onChange:e=>v({...g,fn:e.target.value}),children:[(0,B.jsx)(`option`,{value:`pdf`,children:P.discrete?`P(X = x)`:`density f(x)`}),(0,B.jsx)(`option`,{value:`cdf`,children:`P(X ≤ x)`}),(0,B.jsx)(`option`,{value:`sf`,children:`P(X > x)`}),(0,B.jsx)(`option`,{value:`inv`,children:`quantile: x with P(X ≤ x) = p`})]}),(0,B.jsxs)(`label`,{className:`kc-inline`,children:[g.fn===`inv`?`p`:`x`,` `,(0,B.jsx)(`input`,{className:`k-input kc-num`,value:g.x,onChange:e=>v({...g,x:e.target.value})})]})]}),y?.error&&(0,B.jsx)(`div`,{className:`kc-error`,children:y.error}),y&&!y.error&&(0,B.jsx)(`table`,{className:`kc-kv`,children:(0,B.jsxs)(`tbody`,{children:[(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:g.fn===`inv`?`x`:g.fn===`pdf`?P.discrete?`P(X = x)`:`f(x)`:g.fn===`cdf`?`P(X ≤ x)`:`P(X > x)`}),(0,B.jsx)(`td`,{className:`kc-mono kc-big`,children:U(y.value,12)})]}),(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:`mean`}),(0,B.jsx)(`td`,{className:`kc-mono`,children:U(y.mean,10)})]}),(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:`variance`}),(0,B.jsx)(`td`,{className:`kc-mono`,children:U(y.var,10)})]})]})})]}),u===`test`&&(0,B.jsxs)(B.Fragment,{children:[(0,B.jsx)(`div`,{className:`kc-btnrow`,children:(0,B.jsx)(`select`,{className:`k-input kc-small-select`,value:x.id,onChange:e=>{S({...x,id:e.target.value}),w(null)},children:Mt.map(e=>(0,B.jsx)(`option`,{value:e.id,children:e.label},e.id))})}),(0,B.jsxs)(`div`,{className:`kc-btnrow kc-wrap`,children:[F.needs.includes(`a`)&&(0,B.jsxs)(`label`,{className:`kc-inline`,children:[x.id===`linreg`?`x`:x.id===`chi2gof`?`observed`:`data`,` `,I(x.a,e=>S({...x,a:e}))]}),F.needs.includes(`b`)&&(0,B.jsxs)(`label`,{className:`kc-inline`,children:[x.id===`linreg`?`y`:x.id===`chi2gof`?`expected`:`second`,` `,I(x.b,e=>S({...x,b:e}))]}),F.needs.includes(`mu0`)&&(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`μ₀ `,(0,B.jsx)(`input`,{className:`k-input kc-num`,value:x.mu0,onChange:e=>S({...x,mu0:e.target.value})})]}),F.needs.includes(`sigma`)&&(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`σ `,(0,B.jsx)(`input`,{className:`k-input kc-num`,value:x.sigma,onChange:e=>S({...x,sigma:e.target.value})})]}),F.needs.includes(`pooled`)&&(0,B.jsxs)(`label`,{className:`kc-inline`,children:[(0,B.jsx)(`input`,{type:`checkbox`,checked:x.pooled,onChange:e=>S({...x,pooled:e.target.checked})}),` equal variances`]}),F.needs.includes(`prop`)&&(0,B.jsxs)(B.Fragment,{children:[(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`successes `,(0,B.jsx)(`input`,{className:`k-input kc-num`,value:x.successes,onChange:e=>S({...x,successes:e.target.value})})]}),(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`n `,(0,B.jsx)(`input`,{className:`k-input kc-num`,value:x.n,onChange:e=>S({...x,n:e.target.value})})]}),(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`p₀ `,(0,B.jsx)(`input`,{className:`k-input kc-num`,value:x.p0,onChange:e=>S({...x,p0:e.target.value})})]})]}),F.needs.includes(`table`)&&(0,B.jsx)(`span`,{className:`kc-inline`,children:J.map(e=>(0,B.jsxs)(`label`,{className:`kc-inline`,children:[(0,B.jsx)(`input`,{type:`checkbox`,checked:x.table.includes(e),onChange:t=>S({...x,table:t.target.checked?[...x.table,e]:x.table.filter(t=>t!==e)})}),e]},e))}),![`chi2gof`,`chi2ind`,`anova`,`normality`].includes(x.id)&&(0,B.jsxs)(`select`,{className:`k-input kc-small-select`,value:x.alt,onChange:e=>S({...x,alt:e.target.value}),children:[(0,B.jsx)(`option`,{value:`two-sided`,children:`H₁: ≠`}),(0,B.jsx)(`option`,{value:`less`,children:`H₁: <`}),(0,B.jsx)(`option`,{value:`greater`,children:`H₁: >`})]}),(0,B.jsxs)(`label`,{className:`kc-inline`,children:[`level `,(0,B.jsx)(`input`,{className:`k-input kc-num`,value:x.level,onChange:e=>S({...x,level:e.target.value})})]}),(0,B.jsx)(`button`,{className:`k-btn primary small`,onClick:()=>void M(),children:`Run test`})]}),C&&(C.ok===!1?(0,B.jsx)(`div`,{className:`kc-error`,children:String(C.error)}):(0,B.jsx)(`table`,{className:`kc-kv`,children:(0,B.jsxs)(`tbody`,{children:[Object.entries(C).filter(([e])=>e!==`ok`).map(([e,t])=>(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:Pt[e]??e}),(0,B.jsx)(`td`,{className:`kc-mono`,children:Array.isArray(t)?`[${t.map(e=>U(e,8)).join(`, `)}]`:typeof t==`number`?U(t,10):String(t)})]},e)),typeof C.p==`number`&&(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`td`,{children:`verdict`}),(0,B.jsx)(`td`,{className:C.p<1-Number(x.level)?`kc-reject`:``,children:C.p<1-Number(x.level)?`Reject H₀ at α = ${U(1-Number(x.level),4)}`:`Do not reject H₀ at α = ${U(1-Number(x.level),4)}`})]})]})}))]})]}),(0,B.jsx)(`div`,{className:`kc-stats-plot`,children:N?(0,B.jsx)(ut,{view:N.view,layers:N.layers}):(0,B.jsx)(`div`,{className:`k-muted kc-pad`,children:`The plot appears here.`})})]})]})}var Pt={statistic:`test statistic`,df:`degrees of freedom`,p:`p-value`,ci:`confidence interval`,mean:`mean`,sd:`sample sd`,n:`n`,mean_a:`mean (first)`,mean_b:`mean (second)`,mean_diff:`mean difference`,phat:`p̂`,slope:`slope`,intercept:`intercept`,r:`r`,stderr:`slope std. error`},Ft={length:`Length`,mass:`Mass`,time:`Time`,velocity:`Speed`,energy:`Energy`,power:`Power`,pressure:`Pressure`,force:`Force`,temperature:`Temperature`,current:`Current`,charge:`Charge`,voltage:`Voltage`,capacitance:`Capacitance`,impedance:`Resistance`,conductance:`Conductance`,inductance:`Inductance`,magnetic_density:`Magnetic field`,magnetic_flux:`Magnetic flux`,amount_of_substance:`Amount`,luminous_intensity:`Light`,frequency:`Frequency`,acceleration:`Acceleration`,action:`Action`};function It({bridge:e,settings:t,insertToCalc:n}){let[r,i]=(0,z.useState)(`1`),[a,o]=(0,z.useState)(`km/h`),[s,c]=(0,z.useState)(`m/s`),[l,u]=(0,z.useState)(null),[d,f]=(0,z.useState)({}),[p,h]=(0,z.useState)([]),[g,_]=(0,z.useState)(``);(0,z.useEffect)(()=>{e.call(`units`).then(e=>e.ok&&e.units&&f(e.units)).catch(()=>{}),e.call(`constants`).then(e=>e.ok&&e.constants&&h(e.constants)).catch(()=>{})},[e]),(0,z.useEffect)(()=>{if(!r.trim()||!a.trim()||!s.trim())return u(null);let n=setTimeout(()=>{e.call(`convert`,{value:r,from:a,to:s,settings:X(t)}).then(e=>u(e.ok?e:{error:e.error})).catch(()=>{})},150);return()=>clearTimeout(n)},[r,a,s,t,e]);let v=l?.num?Ce(l.num,{...Te(t),digits:Math.min(t.digits,30)},t.complex,t.angle):null,y=(0,z.useMemo)(()=>[...new Set(Object.values(d).flat()),`degC`,`degF`,`degR`],[d]),b=(0,z.useMemo)(()=>{let e=g.trim().toLowerCase();return e?p.filter(t=>t.name.toLowerCase().includes(e)||t.alias?.toLowerCase()===e||t.unit.toLowerCase().includes(e)):p},[p,g]),x=e=>/^(deg[CFR]|°[CFR])$/.test(e.trim());return(0,B.jsxs)(`div`,{className:`kc-units`,children:[(0,B.jsxs)(`div`,{className:`kc-units-left`,children:[(0,B.jsxs)(`div`,{className:`kc-panel`,children:[(0,B.jsx)(`div`,{className:`kc-panel-title`,children:`Convert`}),(0,B.jsxs)(`div`,{className:`kc-convert`,children:[(0,B.jsx)(`input`,{className:`k-input kc-mono kc-conv-value`,value:r,onChange:e=>i(e.target.value),"aria-label":`Value`}),(0,B.jsx)(`input`,{className:`k-input kc-mono`,list:`kc-unit-list`,value:a,onChange:e=>o(e.target.value),"aria-label":`From unit`,placeholder:`km/h`}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Swap`,onClick:()=>{o(s),c(a)},children:(0,B.jsx)(oe,{size:15})}),(0,B.jsx)(`input`,{className:`k-input kc-mono`,list:`kc-unit-list`,value:s,onChange:e=>c(e.target.value),"aria-label":`To unit`,placeholder:`m/s`}),(0,B.jsx)(`datalist`,{id:`kc-unit-list`,children:y.map(e=>(0,B.jsx)(`option`,{value:e},e))})]}),(0,B.jsx)(`div`,{className:`kc-conv-out`,children:l?.error?(0,B.jsx)(`span`,{className:`kc-error`,children:l.error}):v?(0,B.jsxs)(B.Fragment,{children:[(0,B.jsx)(`span`,{className:`kc-big kc-mono`,children:v.text}),(0,B.jsxs)(`span`,{className:`k-muted`,children:[` `,s]}),l?.latex&&!/^-?[\d.]+$/.test(l.text??``)&&(0,B.jsx)(`div`,{className:`k-muted kc-conv-exact`,children:(0,B.jsx)(V,{tex:`= ${l.latex}`})})]}):(0,B.jsx)(`span`,{className:`k-muted`,children:`…`})}),(0,B.jsx)(`div`,{className:`kc-btnrow`,children:(0,B.jsxs)(`button`,{className:`k-btn small`,disabled:x(a)||x(s),title:x(a)?`Temperatures with an offset convert here only`:``,onClick:()=>n(`${r}${Lt(a)} ▶ ${Lt(s)}`),children:[(0,B.jsx)(m,{size:13}),` Use in Calculate`]})}),(0,B.jsxs)(`div`,{className:`k-muted kc-hint`,children:[`Units can be combined: `,(0,B.jsx)(`code`,{children:`kWh`}),`, `,(0,B.jsx)(`code`,{children:`J/(mol*K)`}),`, `,(0,B.jsx)(`code`,{children:`m s^-2`}),`, prefixes on any SI unit (`,(0,B.jsx)(`code`,{children:`µm`}),`, `,(0,B.jsx)(`code`,{children:`MPa`}),`, `,(0,B.jsx)(`code`,{children:`GHz`}),`, `,(0,B.jsx)(`code`,{children:`nF`}),`). In Calculate, write units with a leading underscore and mix them freely: `,(0,B.jsx)(`code`,{children:`3_m/_s * 2_h`}),`, `,(0,B.jsx)(`code`,{children:`100_km/_h ▶ _m/_s`}),`.`]})]}),(0,B.jsxs)(`div`,{className:`kc-panel kc-unit-ref`,children:[(0,B.jsx)(`div`,{className:`kc-panel-title`,children:`Units`}),Object.entries(d).map(([e,t])=>(0,B.jsxs)(`div`,{className:`kc-unit-cat`,children:[(0,B.jsx)(`div`,{className:`kc-cat-title`,children:Ft[e]??e.replace(/_/g,` `)}),(0,B.jsx)(`div`,{className:`kc-chips`,children:t.map(e=>(0,B.jsx)(`button`,{className:`kc-chip`,title:`Insert _${e}`,onClick:()=>n(`_${e}`),children:e},e))})]},e))]})]}),(0,B.jsxs)(`div`,{className:`kc-units-right`,children:[(0,B.jsxs)(`div`,{className:`kc-panel-title`,children:[`Physical constants `,(0,B.jsxs)(`span`,{className:`k-muted`,children:[`(CODATA, from SciPy) — click one to use it: `,(0,B.jsx)(`code`,{children:`#c`}),`, `,(0,B.jsx)(`code`,{children:`#hbar`}),`, or `,(0,B.jsx)(`code`,{children:`const("…")`})]})]}),(0,B.jsx)(`input`,{className:`k-input kc-side-search`,placeholder:`Search: electron, Boltzmann, J K^-1…`,value:g,onChange:e=>_(e.target.value)}),(0,B.jsxs)(`div`,{className:`kc-table-scroll`,children:[(0,B.jsxs)(`table`,{className:`kc-table kc-const-table`,children:[(0,B.jsx)(`thead`,{children:(0,B.jsxs)(`tr`,{children:[(0,B.jsx)(`th`,{children:`Symbol`}),(0,B.jsx)(`th`,{children:`Name`}),(0,B.jsx)(`th`,{children:`Value`}),(0,B.jsx)(`th`,{children:`Unit`}),(0,B.jsx)(`th`,{children:`Uncertainty`})]})}),(0,B.jsx)(`tbody`,{children:b.slice(0,500).map(e=>(0,B.jsxs)(`tr`,{onClick:()=>n(e.alias?`#${e.alias}`:`const("${e.name}")`),title:`Insert in Calculate`,children:[(0,B.jsx)(`td`,{className:`kc-mono`,children:e.alias?`#${e.alias}`:``}),(0,B.jsx)(`td`,{children:e.name}),(0,B.jsx)(`td`,{className:`kc-mono`,children:e.value}),(0,B.jsx)(`td`,{className:`kc-mono`,children:e.unit}),(0,B.jsx)(`td`,{className:`kc-mono`,children:e.exact?`exact`:e.uncertainty})]},e.name))})]}),!p.length&&(0,B.jsx)(`div`,{className:`k-muted kc-pad`,children:`Loading the constants…`})]})]})]})}function Lt(e){return e.trim().replace(/(?<![\w.])([A-Za-zµμΩÅ°][A-Za-z0-9µμΩÅ°]*)/g,`_$1`).replace(/__/g,`_`)}var Q=class extends Error{},Rt={and:`&`,or:`|`,xor:`^`,mod:`%`,shl:`<<`,shr:`>>>`,sar:`>>`,nand:`nand`,nor:`nor`,xnor:`xnor`,rol:`rol`,ror:`ror`},zt={2:/^[01]+$/,8:/^[0-7]+$/,10:/^[0-9]+$/,16:/^[0-9A-Fa-f]+$/};function Bt(e,t,n){let r=BigInt(t);return n?BigInt.asIntN(t,e):BigInt.asUintN(Number(r),e)}function Vt(e,t){let n=e.replace(/_/g,``);if(!zt[t].test(n))throw new Q(`'${e}' is not a ${Ht(t)} number`);return BigInt((t===16?`0x`:t===8?`0o`:t===2?`0b`:``)+n)}function Ht(e){return e===2?`binary`:e===8?`octal`:e===16?`hexadecimal`:`decimal`}function Ut(e,t){let n=[],r=0;for(;r<e.length;){let i=e[r];if(/\s/.test(i)){r++;continue}let a=e.slice(r),o=/^0[xX][0-9A-Fa-f_]+|^0[bB][01_]+|^0[oO][0-7_]+/.exec(a);if(o){n.push({t:`num`,v:BigInt(o[0].replace(/_/g,``).replace(/^0X/,`0x`).replace(/^0B/,`0b`).replace(/^0O/,`0o`))}),r+=o[0].length;continue}if(o=/^([0-9][0-9A-Fa-f_]*)([hHoOdD]|[bB](?![0-9A-Fa-f]))(?![\w])/.exec(a),o&&!(t===16&&/[bBdD]$/.test(o[0])&&zt[16].test(o[0]))){let e=o[2].toLowerCase(),t=e===`h`?16:e===`o`?8:e===`b`?2:10;n.push({t:`num`,v:Vt(o[1],t)}),r+=o[0].length;continue}if(o=/^[0-9][0-9A-Za-z_]*/.exec(a),o){n.push({t:`num`,v:Vt(o[0],t)}),r+=o[0].length;continue}if(o=/^[A-Za-z_][A-Za-z0-9_]*/.exec(a),o){let e=o[0],i=e.toLowerCase();t===16&&/^[A-F]+$/.test(e)?n.push({t:`num`,v:BigInt(`0x`+e)}):i in Rt?n.push({t:`op`,v:Rt[i]}):i===`not`?n.push({t:`op`,v:`~`}):n.push({t:`name`,v:e}),r+=e.length;continue}let s=e.slice(r,r+3),c=e.slice(r,r+2);if(s===`>>>`)n.push({t:`op`,v:`>>>`}),r+=3;else if([`<<`,`>>`,`**`].includes(c))n.push({t:`op`,v:c}),r+=2;else if(`+-*/%&|^~!`.includes(i))n.push({t:`op`,v:i===`!`?`~`:i}),r++;else if(i===`(`)n.push({t:`(`}),r++;else if(i===`)`)n.push({t:`)`}),r++;else if(i===`,`)n.push({t:`,`}),r++;else throw new Q(`Unexpected '${i}'`)}return n}var Wt=[[`|`,`nor`],[`^`,`xnor`],[`&`,`nand`],[`<<`,`>>`,`>>>`,`rol`,`ror`],[`+`,`-`],[`*`,`/`,`%`]];function Gt(e,t,n={}){let r=Ut(e,t.base);if(!r.length)throw new Q(`Nothing to calculate`);let i=0,a=e=>Bt(e,t.bits,t.signed),o=(1n<<BigInt(t.bits))-1n,s=e=>e&o,c=()=>r[i],l=e=>{let t=c();return t?.t===`op`&&t.v===e},u=(e,n,r)=>{let i=BigInt(t.bits),c=(n%i+i)%i,l=s(e),u=r?(l<<c|l>>i-c)&o:(l>>c|l<<i-c)&o;return a(u)},d=(e,n,r)=>{switch(e){case`+`:return a(n+r);case`-`:return a(n-r);case`*`:return a(n*r);case`/`:if(r===0n)throw new Q(`Division by zero`);return a(n/r);case`%`:if(r===0n)throw new Q(`Division by zero`);return a(n%r);case`&`:return a(n&r);case`|`:return a(n|r);case`^`:return a(n^r);case`nand`:return a(~(n&r));case`nor`:return a(~(n|r));case`xnor`:return a(~(n^r));case`<<`:return a(r>=BigInt(t.bits)?0n:n<<r);case`>>`:return a(n>>r);case`>>>`:return a(s(n)>>r);case`rol`:return u(n,r,!0);case`ror`:return u(n,r,!1);case`**`:if(r<0n)throw new Q(`Negative powers are not integers`);return a(n**r)}throw new Q(`Unknown operator ${e}`)},f=e=>{if(e>=Wt.length)return p();let t=f(e+1);for(;;){let n=c();if(n?.t===`op`&&Wt[e].includes(n.v))i++,t=d(n.v,t,f(e+1));else return t}},p=()=>{let e=m();return l(`**`)?(i++,d(`**`,e,p())):e},m=()=>l(`-`)?(i++,a(-m())):l(`+`)?(i++,m()):l(`~`)?(i++,a(~m())):_(),h=()=>{if(c()?.t!==`(`)throw new Q(`Expected (`);i++;let e=[];if(c()?.t===`)`)return i++,e;for(;;){e.push(f(0));let t=c();if(t?.t===`,`)i++;else if(t?.t===`)`)return i++,e;else throw new Q(`Missing ')'`)}},g=(e,n)=>{let r=t=>{if(n.length!==t)throw new Q(`${e} takes ${t} value${t>1?`s`:``}`)};switch(e.toLowerCase()){case`rol`:return r(2),u(n[0],n[1],!0);case`ror`:return r(2),u(n[0],n[1],!1);case`shl`:return r(2),d(`<<`,n[0],n[1]);case`shr`:return r(2),d(`>>>`,n[0],n[1]);case`sar`:return r(2),d(`>>`,n[0],n[1]);case`not`:return r(1),a(~n[0]);case`and`:return r(2),a(n[0]&n[1]);case`or`:return r(2),a(n[0]|n[1]);case`xor`:return r(2),a(n[0]^n[1]);case`popcount`:case`popcnt`:{r(1);let e=s(n[0]),t=0n;for(;e;)t+=e&1n,e>>=1n;return t}case`clz`:{r(1);let e=s(n[0]),i=0n;for(let n=BigInt(t.bits)-1n;n>=0n&&!(e>>n&1n);n--)i++;return i}case`ctz`:{r(1);let e=s(n[0]);if(!e)return BigInt(t.bits);let i=0n;for(;!(e>>i&1n);)i++;return i}case`abs`:return r(1),a(n[0]<0n?-n[0]:n[0]);case`min`:if(!n.length)throw new Q(`min needs values`);return n.reduce((e,t)=>t<e?t:e);case`max`:if(!n.length)throw new Q(`max needs values`);return n.reduce((e,t)=>t>e?t:e);case`bit`:return r(2),s(n[0])>>n[1]&1n;case`setbit`:return r(2),a(n[0]|1n<<n[1]);case`clearbit`:return r(2),a(n[0]&~(1n<<n[1]));case`flipbit`:return r(2),a(n[0]^1n<<n[1]);case`mod`:return r(2),d(`%`,n[0],n[1])}throw new Q(`Unknown function ${e}`)},_=()=>{let e=c();if(!e)throw new Q(`Incomplete expression`);if(e.t===`num`)return i++,a(e.v);if(e.t===`(`){i++;let e=f(0);if(c()?.t!==`)`)throw new Q(`Missing ')'`);return i++,e}if(e.t===`op`&&[`rol`,`ror`,`<<`,`>>>`,`>>`,`&`,`|`,`^`,`%`].includes(e.v)&&r[i+1]?.t===`(`){let t={"<<":`shl`,">>>":`shr`,">>":`sar`,"&":`and`,"|":`or`,"^":`xor`,"%":`mod`}[e.v]??e.v;return i++,g(t,h())}if(e.t===`name`){if(i++,c()?.t===`(`)return g(e.v,h());let t=e.v.toLowerCase();if(t in n)return a(n[t]);throw new Q(`Unknown name '${e.v}'`)}throw new Q(`Unexpected `+(e.t===`op`?e.v:e.t))},v=f(0);if(i<r.length){let e=r[i];throw new Q(e.t===`)`?`')' has no opening bracket`:`Unexpected ${e.t===`num`?`number`:e.t===`op`||e.t===`name`?e.v:e.t}`)}return v}function Kt(e,t,n,r,i=!1){let a;if(a=t===10?(r?BigInt.asIntN(n,e):BigInt.asUintN(n,e)).toString(10):BigInt.asUintN(n,e).toString(t).toUpperCase(),!i)return a;let o=a.startsWith(`-`),s=o?a.slice(1):a,c=t===2||t===16?4:3,l=t===10?`,`:` `,u=[];for(let e=s.length;e>0;e-=c)u.unshift(s.slice(Math.max(0,e-c),e));return(o?`-`:``)+u.join(l)}function qt(e,t){let n=BigInt.asUintN(t,e),r=[];for(let e=t-1;e>=0;e--)r.push(Number(n>>BigInt(e)&1n));return r}function Jt(e,t,n){return Bt(e^1n<<BigInt(t),n.bits,n.signed)}var Yt=[{b:16,label:`HEX`},{b:10,label:`DEC`},{b:8,label:`OCT`},{b:2,label:`BIN`}],Xt=[...[`A`,`B`,`C`,`D`,`E`,`F`].map(e=>({label:e,ins:e,hexOnly:!0})),{label:`AND`,ins:` and `},{label:`OR`,ins:` or `},{label:`XOR`,ins:` xor `},{label:`NOT`,ins:`not `},{label:`NAND`,ins:` nand `},{label:`NOR`,ins:` nor `},{label:`<<`,ins:` << `},{label:`>>`,ins:` >> `,title:`Arithmetic shift right`},{label:`>>>`,ins:` >>> `,title:`Logical shift right`},{label:`ROL`,ins:` rol `},{label:`ROR`,ins:` ror `},{label:`MOD`,ins:` mod `},{label:`popcount`,ins:`popcount(`},{label:`(`,ins:`(`},{label:`)`,ins:`)`},{label:`ans`,ins:`ans`}],Zt=e=>void navigator.clipboard?.writeText(e).catch(()=>{});function Qt({settings:e,setSettings:t}){let[n,r]=(0,z.useState)(``),[i,a]=(0,z.useState)(0n),[o,s]=(0,z.useState)([]),c=(0,z.useRef)(null),l={base:e.base,bits:e.bits,signed:e.signed},u=(0,z.useMemo)(()=>{if(!n.trim())return null;try{return{v:Gt(n,l,{ans:i})}}catch(e){return{error:e instanceof Q?e.message:String(e)}}},[n,e.base,e.bits,e.signed,i]),d=()=>{u&&`v`in u&&u.v!==void 0&&(a(u.v),s([...o.slice(-200),{input:n,value:u.v,base:e.base}]),r(``))},f=e=>{let t=c.current,i=t?.selectionStart??n.length,a=t?.selectionEnd??n.length,o=n.slice(0,i)+e+n.slice(a);r(o),requestAnimationFrame(()=>{t?.focus(),t?.setSelectionRange(i+e.length,i+e.length)})},p=u&&`v`in u&&u.v!==void 0?u.v:i,m=qt(p,e.bits);return(0,B.jsxs)(`div`,{className:`kc-prog`,children:[(0,B.jsxs)(`div`,{className:`kc-btnrow`,children:[(0,B.jsx)(`div`,{className:`kc-seg`,children:Yt.map(n=>(0,B.jsx)(`button`,{className:e.base===n.b?`active`:``,onClick:()=>t({base:n.b}),children:n.label},n.b))}),(0,B.jsx)(`div`,{className:`kc-seg`,children:[8,16,32,64].map(n=>(0,B.jsxs)(`button`,{className:e.bits===n?`active`:``,onClick:()=>t({bits:n}),children:[n,`-bit`]},n))}),(0,B.jsxs)(`div`,{className:`kc-seg`,children:[(0,B.jsx)(`button`,{className:e.signed?`active`:``,onClick:()=>t({signed:!0}),children:`signed`}),(0,B.jsx)(`button`,{className:e.signed?``:`active`,onClick:()=>t({signed:!1}),children:`unsigned`})]})]}),(0,B.jsx)(`div`,{className:`kc-prog-values`,children:Yt.map(n=>(0,B.jsxs)(`div`,{className:`kc-prog-row${e.base===n.b?` current`:``}`,onClick:()=>t({base:n.b}),children:[(0,B.jsx)(`span`,{className:`kc-prog-base`,children:n.label}),(0,B.jsx)(`span`,{className:`kc-mono kc-prog-num`,children:Kt(p,n.b,e.bits,e.signed,!0)}),(0,B.jsx)(`button`,{className:`k-icon-btn`,title:`Copy`,onClick:t=>{t.stopPropagation(),Zt(Kt(p,n.b,e.bits,e.signed))},children:(0,B.jsx)(I,{size:13})})]},n.b))}),(0,B.jsx)(`div`,{className:`kc-bits`,style:{gridTemplateColumns:`repeat(${Math.min(32,e.bits)}, 1fr)`},children:m.map((t,n)=>{let i=e.bits-1-n;return(0,B.jsxs)(`button`,{className:`kc-bit${t?` on`:``}${i%4==3?` nib`:``}`,title:`bit ${i}`,onClick:()=>{let e=Jt(p,i,l);a(e),r(``)},children:[(0,B.jsx)(`span`,{children:t}),i%4==0&&(0,B.jsx)(`small`,{children:i})]},n)})}),(0,B.jsx)(`div`,{className:`kc-line`,children:(0,B.jsx)(`input`,{ref:c,className:`kc-input`,value:n,spellCheck:!1,placeholder:e.base===16?`FF and 0x0F << 2`:e.base===2?`1010 xor 0110`:`255 and 15 << 2`,onChange:e=>r(e.target.value),onKeyDown:e=>{e.key===`Enter`&&d(),e.key===`ArrowUp`&&o.length&&r(o[o.length-1].input),e.key===`Escape`&&r(``)}})}),(0,B.jsx)(`div`,{className:`kc-prog-live${u&&`error`in u?` error`:``}`,children:u?`error`in u?u.error:`= ${Kt(u.v,e.base,e.bits,e.signed)}`:` `}),(0,B.jsx)(`div`,{className:`kc-prog-keys`,children:Xt.map(t=>(0,B.jsx)(`button`,{className:`kc-key kind-fn`,disabled:t.hexOnly&&e.base!==16,title:t.title??t.ins.trim(),onMouseDown:e=>e.preventDefault(),onClick:()=>f(t.ins),children:(0,B.jsx)(`span`,{className:`kc-key-main`,children:t.label})},t.label))}),(0,B.jsx)(`div`,{className:`kc-prog-log`,children:o.slice().reverse().map((t,n)=>(0,B.jsxs)(`div`,{className:`kc-prog-logrow`,onClick:()=>r(t.input),children:[(0,B.jsx)(`span`,{className:`kc-mono`,children:t.input}),(0,B.jsxs)(`span`,{className:`kc-mono`,children:[`= `,Kt(t.value,e.base,e.bits,e.signed)]})]},n))})]})}var $t=[{label:`π to 1000 digits (mpmath)`,code:`import mpmath
mpmath.mp.dps = 1000
print(mpmath.pi)
`},{label:`Newton's method`,code:`import sympy as sp
x = sp.symbols("x")
f = sp.cos(x) - x
df = sp.diff(f, x)
v = sp.Float(1, 30)
for i in range(8):
    v = v - f.subs(x, v) / df.subs(x, v)
    print(i, v)
`},{label:`Lorenz system (SciPy) + plot`,code:`import numpy as np
from scipy.integrate import solve_ivp
import matplotlib.pyplot as plt

def lorenz(t, s, sigma=10, rho=28, beta=8/3):
    x, y, z = s
    return [sigma*(y-x), x*(rho-z)-y, x*y-beta*z]

sol = solve_ivp(lorenz, (0, 40), [1, 1, 1], max_step=0.01)
plt.plot(sol.y[0], sol.y[2], lw=0.5)
plt.xlabel("x"); plt.ylabel("z")
`},{label:`A function for Calculate`,code:`# After running this, type  collatz(27)  in Calculate.
def collatz(n):
    n = int(n)
    steps = 0
    while n != 1:
        n = n // 2 if n % 2 == 0 else 3*n + 1
        steps += 1
    return steps
`},{label:`Symbolic: Fourier coefficients`,code:`import sympy as sp
x, n = sp.symbols("x n", integer=False)
k = sp.symbols("k", integer=True, positive=True)
f = x
b = sp.integrate(f*sp.sin(k*x), (x, -sp.pi, sp.pi)) / sp.pi
sp.simplify(b)
`}];function en({bridge:e,code:t,setCode:n,onDefined:r}){let[i,a]=(0,z.useState)([]),[o,s]=(0,z.useState)(!1),c=async()=>{if(o)return;s(!0);let n=[],i=(e,t)=>{let r=n[n.length-1];r&&r.kind===e&&e!==`img`&&e!==`result`?r.text+=t:n.push({kind:e,text:t}),a([...n])};try{let n=await e.runProgram(t,(e,t)=>i(e,t));n.result!==null&&i(`result`,n.result);for(let e of n.figures)i(`img`,e);n.error&&i(`err`,n.error.traceback||`${n.error.type}: ${n.error.message}`),r()}catch(e){i(`err`,e instanceof Error?e.message:String(e))}finally{s(!1)}};return(0,B.jsxs)(`div`,{className:`kc-program`,children:[(0,B.jsxs)(`div`,{className:`k-toolbar kc-graph-bar`,children:[(0,B.jsxs)(`button`,{className:`k-btn primary small`,disabled:o,onClick:()=>void c(),title:`Run (Ctrl+Enter)`,children:[(0,B.jsx)(w,{size:13}),` Run`]}),(0,B.jsxs)(`button`,{className:`k-btn small`,onClick:()=>a([]),children:[(0,B.jsx)(_,{size:13}),` Clear output`]}),(0,B.jsxs)(`select`,{className:`k-input kc-small-select`,value:``,onChange:e=>{let t=$t.find(t=>t.label===e.target.value);t&&n(t.code)},children:[(0,B.jsx)(`option`,{value:``,children:`Examples…`}),$t.map(e=>(0,B.jsx)(`option`,{children:e.label},e.label))]}),(0,B.jsx)(`span`,{className:`k-spacer`}),(0,B.jsx)(`span`,{className:`k-muted small`,children:`Same Python as the calculator: functions defined here work in Calculate.`})]}),(0,B.jsxs)(`div`,{className:`kc-program-split`,children:[(0,B.jsx)(`div`,{className:`kc-program-editor`,children:(0,B.jsx)(ie,{value:t,onChange:n,language:`python`,lineNumbers:!0,keys:[{key:`Mod-Enter`,run:()=>(c(),!0)},{key:`Shift-Enter`,run:()=>(c(),!0)}]})}),(0,B.jsxs)(`div`,{className:`kc-program-out`,children:[!i.length&&(0,B.jsx)(`div`,{className:`k-muted kc-pad`,children:`Output appears here. Ctrl+Enter runs the cell.`}),i.map((e,t)=>e.kind===`img`?(0,B.jsx)(`img`,{className:`kc-fig`,src:L(e.text),alt:`Figure`},t):(0,B.jsx)(`pre`,{className:`kc-out kc-out-${e.kind}`,children:e.kind===`result`?`→ ${e.text}`:e.text},t))]})]})]})}var $=e=>typeof e==`string`&&e.trim()?e.trim():void 0;function tn(e,t){if(!e.answer.ok)return{input:e.input,error:e.answer.error};let n=Ee(e.answer,t);return{input:e.input,result:e.answer.text,...n.approxText&&n.approxText!==e.answer.text?{decimal:n.approxText}:{},...n.text&&n.text!==e.answer.text?{shown:n.text}:{},latex:e.answer.latex}}function nn(e){let t=async(t,n)=>{let r=await e.evaluate(t,n);if(!r)throw Error(`The calculation was cancelled.`);let i=tn(r,{...e.settings(),...n});if(`error`in i&&i.error)throw Error(`${t}: ${i.error}`);return i};return{evaluate:async e=>{let n=$(e.expression);if(!n)throw Error(`Pass what to calculate as "expression".`);let r={};return(e.mode===`exact`||e.mode===`decimal`||e.mode===`fraction`)&&(r.number=e.mode),typeof e.digits==`number`&&e.digits>=1&&(r.digits=Math.min(1e3,Math.round(e.digits))),t(n,r)},solve:async e=>{let n=$(e.equation);if(!n)throw Error(`Pass the equation as "equation", e.g. "x^2 = 2".`);let r=$(e.variable);if(e.numeric===!0){let i=$(e.guess)??`0`;return t(`nsolve(${n}, ${r??`x`}, ${i})`)}return t(r?`solve(${n}, ${r})`:`solve(${n})`)},convert:async t=>{let n=$(t.value)??(typeof t.value==`number`?String(t.value):void 0),r=$(t.from),i=$(t.to);if(!n||!r||!i)throw Error(`Pass "value", "from" and "to", e.g. 100, "km/h", "m/s".`);let a=await e.convert(n,r.replace(/^_/,``),i.replace(/^_/,``));if(!a.ok)throw Error(a.error??`Could not convert`);let o=Ee(a,e.settings());return{value:n,from:r,to:i,result:a.text,...o.approxText?{decimal:o.approxText}:o.text===a.text?{}:{decimal:o.text}}},get_history:async t=>{let n=typeof t.limit==`number`&&t.limit>0?Math.min(200,Math.round(t.limit)):20,r=e.settings();return{entries:e.history().slice(-n).map(e=>tn(e,r)),variables:e.vars().map(e=>e.text),modes:{number:r.number,angle:r.angle,digits:r.digits,complex:r.complex,format:r.format}}},set_mode:async t=>{let n={};if((t.number===`exact`||t.number===`decimal`||t.number===`fraction`)&&(n.number=t.number),(t.angle===`deg`||t.angle===`rad`||t.angle===`grad`)&&(n.angle=t.angle),typeof t.digits==`number`&&t.digits>=1&&(n.digits=Math.min(1e3,Math.round(t.digits))),(t.complex===`rect`||t.complex===`polar`)&&(n.complex=t.complex),(t.format===`normal`||t.format===`sci`||t.format===`eng`||t.format===`fix`)&&(n.format=t.format),!Object.keys(n).length)throw Error(`Pass at least one of number, angle, digits, complex, format.`);e.setSettings(n);let r={...e.settings(),...n};return{number:r.number,angle:r.angle,digits:r.digits,complex:r.complex,format:r.format}}}}var rn=[{id:`calc`,label:`Calculate`,icon:o},{id:`graph`,label:`Graph`,icon:a},{id:`matrix`,label:`Matrix`,icon:b},{id:`stats`,label:`Statistics`,icon:s},{id:`units`,label:`Units & constants`,icon:f},{id:`base`,label:`Base`,icon:c},{id:`python`,label:`Python`,icon:l}],an=`${j}/.khervecalc/autosave.kcalc`,on=`kherveos.khervecalc.prefs`;function sn(){let e={keypad:!0,side:!0,tab:`calc`};try{let t=JSON.parse(localStorage.getItem(on)??`{}`);return{...e,...t,tab:rn.some(e=>e.id===t.tab)?t.tab:`calc`}}catch{return e}}var cn=[6,8,10,12,15,20,30,50,100,200,500,1e3];function ln({win:e,args:t}){let[n,i]=(0,z.useState)(Ie),a=(0,z.useRef)(n),o=(0,z.useCallback)(e=>{let t=typeof e==`function`?e(a.current):e;a.current=t,i(t)},[]),[s,c]=(0,z.useState)(sn),[l,u]=(0,z.useState)([]),d=(0,z.useRef)(l);d.current=l;let[f,p]=(0,z.useState)(``),m=(0,z.useRef)(null),[h,g]=(0,z.useState)(null),[_,v]=(0,z.useState)(Date.now()),[y,b]=(0,z.useState)(null),[S,w]=(0,z.useState)(`off`),[T,E]=(0,z.useState)(null),[O,ee]=(0,z.useState)(!1),k=(0,z.useMemo)(()=>new he(`khervecalc-${e.id}`),[e.id]),j=e=>c(t=>{let n={...t,...e};try{localStorage.setItem(on,JSON.stringify(n))}catch{}return n}),M=s.tab,N=n.settings,P=(0,z.useCallback)(e=>o(t=>({...t,settings:{...t.settings,...e}})),[o]);(0,z.useEffect)(()=>{k.onBusy=g,k.onProgress=b,k.onRestarted=async()=>{let e=a.current,t=e.history.filter(e=>e.answer.ok&&e.answer.srepr).slice(-60).map(e=>({id:e.id,srepr:e.answer.srepr})),n=await k.direct(`restore`,{settings:X(e.settings),defs:e.defs,results:t,lists:e.lists});n.ok&&Array.isArray(n.vars)&&u(n.vars)};let e=k.kernel.onStatus(w);return()=>{e(),k.dispose()}},[k]),(0,z.useEffect)(()=>{if(!h)return;let e=setInterval(()=>v(Date.now()),250);return()=>clearInterval(e)},[h]),(0,z.useEffect)(()=>{let e=!0;return(async()=>{let n=typeof t.path==`string`?t.path:null,i=n??(r.fs.exists(an)?an:null);if(i)try{let t=Ue(await r.fs.readText(i));if(!e)return;o(t),n&&E(n)}catch(e){n&&r.dialog.alert(e instanceof Error?e.message:String(e),{title:`kCalc`})}ee(!0),k.ensure().catch(e=>b(e instanceof Error?e.message:String(e)))})(),()=>{e=!1}},[t.path,k,o]),(0,z.useEffect)(()=>{if(!O)return;let e=setTimeout(()=>{r.fs.writeText(an,We(n),{mkdirs:!0}).catch(()=>{})},1200);return()=>clearTimeout(e)},[n,O]),(0,z.useEffect)(()=>{if(!O)return;let e=setTimeout(()=>void k.call(`lists`,{lists:n.lists}).catch(()=>{}),300);return()=>clearTimeout(e)},[n.lists,O,k]),(0,z.useEffect)(()=>{e.setTitle(T?`kCalc — ${A(T)}`:`kCalc`)},[T,e]);let I=(0,z.useCallback)(async(e,t={})=>{let n=a.current,r={...n.settings,...t.override??{},...t.approx?{number:`decimal`}:{}},i=t.replaceId?n.history.findIndex(e=>e.id===t.replaceId):-1,s=t.replaceId&&i>=0?t.replaceId:Re(),c;try{c=await k.call(`eval`,{src:e,settings:X(r),ans:ze(n.history,i>=0?i:n.history.length),id:s})}catch(e){let t=e instanceof Error?e.message:String(e);if(t===`Cancelled`)return null;c={ok:!1,error:t}}let l={id:s,input:e,inputLatex:c.input_latex??void 0,answer:c,time:Date.now(),mode:{number:r.number,angle:r.angle,digits:r.digits}};return o(t=>{let n=t.history.findIndex(e=>e.id===s)>=0?t.history.map(e=>e.id===s?l:e):[...t.history,l].slice(-400),r=c.ok&&c.kind===`def`&&c.name?Be(t.defs,c.name,e):t.defs;return{...t,history:n,defs:r}}),Array.isArray(c.vars)&&u(c.vars),l},[k,o]),te=e=>{o(t=>({...t,history:t.history.filter(t=>t.id!==e)})),k.call(`forget`,{ids:[e]}).catch(()=>{})},L=async()=>{if(!a.current.history.length||!await r.dialog.confirm(`Clear the whole history? Variables stay defined.`,{title:`kCalc`,okLabel:`Clear`,danger:!0}))return;let e=a.current.history.map(e=>e.id);o(e=>({...e,history:[]})),k.call(`forget`,{ids:e}).catch(()=>{})},re=async e=>{let t=await k.call(`delvar`,{name:e});t.vars&&u(t.vars),o(t=>({...t,defs:t.defs.filter(t=>Ve(t)!==e)}))},ie=async()=>{await r.dialog.confirm(`Forget every variable and function?`,{title:`kCalc`,okLabel:`Forget`,danger:!0})&&(await k.call(`clearvars`),u([]),o(e=>({...e,defs:[]})))},R=e=>{j({tab:`calc`});let t=m.current,n=t?.selectionStart??f.length,r=t?.selectionEnd??f.length,i=f.slice(0,n)+e+f.slice(r);p(i),requestAnimationFrame(()=>{m.current?.focus(),m.current?.setSelectionRange(n+e.length,n+e.length)})},ae=e=>{o(t=>{let n=new Set(t.graphs.map(e=>e.color)),r=ct.find(e=>!n.has(e))??ct[t.graphs.length%ct.length];return{...t,graphs:[...t.graphs,{id:Re(),kind:`y`,expr:e,color:r,visible:!0}]}}),j({tab:`graph`})},oe=()=>void k.call(`vars`).then(e=>e.vars&&u(e.vars)).catch(()=>{}),se=async(e,t)=>{o(e),E(t),u([]),p(``),await k.cancel()},ce=async()=>{(!a.current.history.length||await r.dialog.confirm(`Start a new session? Save this one first if you want to keep it.`,{title:`kCalc`,okLabel:`New session`}))&&await se(Ie(),null)},le=async()=>{let e=await r.dialog.openFile({title:`Open a kCalc session`,extensions:[`.kcalc`]});if(e)try{await se(Ue(await r.fs.readText(e)),e)}catch(e){r.dialog.alert(e instanceof Error?e.message:String(e),{title:`kCalc`})}},ue=async()=>{let e=await r.dialog.saveFile({title:`Save the session`,extensions:[`.kcalc`],defaultName:T??`Session.kcalc`});e&&(await r.fs.writeText(e,We(a.current),{mkdirs:!0}),E(e),r.notify({title:`Session saved`,body:e}))},de=async()=>{if(!T)return ue();await r.fs.writeText(T,We(a.current)),r.notify({title:`Session saved`,body:T})},fe=async()=>{let e=await r.dialog.saveFile({title:`Export the history`,extensions:[`.txt`],defaultName:`kCalc history.txt`});e&&await r.fs.writeText(e,Ge(a.current.history),{mkdirs:!0})},pe=e=>{let t=[...a.current.history].reverse().find(e=>e.answer.ok);t&&navigator.clipboard?.writeText((e?t.answer.latex:t.answer.text)??``).catch(()=>{})},me=()=>void k.cancel();ne(e,nn({settings:()=>a.current.settings,evaluate:(e,t)=>I(e,{override:t}),convert:(e,t,n)=>k.call(`convert`,{value:e,from:t,to:n,settings:X(a.current.settings)}),history:()=>a.current.history,vars:()=>d.current,setSettings:P}));let ge=(0,z.useMemo)(()=>{let t=(e,t)=>t.map(([t,n])=>({label:n,checked:N[e]===t,onClick:()=>P({[e]:t})}));return[{label:`File`,items:[{label:`New Session`,onClick:()=>void ce()},{label:`Open Session…`,shortcut:`⌘O`,onClick:()=>void le()},`-`,{label:`Save Session`,shortcut:`⌘S`,onClick:()=>void de()},{label:`Save Session As…`,onClick:()=>void ue()},{label:`Export History as Text…`,onClick:()=>void fe()},`-`,{label:`Close`,onClick:()=>e.close()}]},{label:`Edit`,items:[{label:`Copy Last Result`,onClick:()=>pe(!1)},{label:`Copy Last Result as LaTeX`,onClick:()=>pe(!0)},`-`,{label:`Clear Line`,onClick:()=>p(``)},{label:`Clear History…`,onClick:()=>void L()},{label:`Forget Variables…`,onClick:()=>void ie()}]},{label:`Mode`,items:[...t(`number`,[[`exact`,`Exact (symbolic)`],[`decimal`,`Decimal`],[`fraction`,`Fraction`]]),`-`,...t(`angle`,[[`deg`,`Degrees`],[`rad`,`Radians`],[`grad`,`Gradians`]]),`-`,...t(`complex`,[[`rect`,`Complex: a + bi`],[`polar`,`Complex: r∠θ`]]),`-`,{label:`Number Format`,submenu:t(`format`,[[`normal`,`Normal`],[`sci`,`Scientific`],[`eng`,`Engineering`],[`fix`,`Fixed decimals`]])},{label:`Digits`,submenu:cn.map(e=>({label:String(e),checked:N.digits===e,onClick:()=>P({digits:e})}))}]},{label:`View`,items:[...rn.map((e,t)=>({label:e.label,shortcut:`⌃${t+1}`,checked:M===e.id,onClick:()=>j({tab:e.id})})),`-`,{label:`Keypad`,checked:s.keypad,onClick:()=>j({keypad:!s.keypad})},{label:`Variables & Catalog`,checked:s.side,onClick:()=>j({side:!s.side})}]},{label:`Python`,items:[{label:`Cancel the Calculation`,shortcut:`⌃.`,disabled:!h,onClick:me},{label:`Restart Python`,onClick:me}]},{label:`Help`,items:[{label:`kCalc Syntax`,onClick:()=>void un()}]}]},[N,M,s,h,T]);(0,z.useEffect)(()=>{e.setMenus(ge)},[ge,e]),(0,z.useEffect)(()=>()=>e.setMenus(null),[e]);let _e=h?(_-h.since)/1e3:0,V=h&&(h.op!==`preview`||_e>1.5)&&_e>.25,ve=(e,t)=>(0,B.jsx)(`div`,{className:`kc-seg`,children:t.map(([t,n,r])=>(0,B.jsx)(`button`,{className:N[e]===t?`active`:``,title:r,onClick:()=>P({[e]:t}),children:n},String(t)))});return(0,B.jsxs)(`div`,{className:`k-app kc-app`,onKeyDown:e=>{(e.ctrlKey||e.metaKey)&&/^[1-7]$/.test(e.key)?(e.preventDefault(),j({tab:rn[Number(e.key)-1].id})):(e.ctrlKey||e.metaKey)&&e.key===`.`?(e.preventDefault(),me()):(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()===`s`?(e.preventDefault(),de()):(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()===`o`&&(e.preventDefault(),le())},children:[(0,B.jsx)(`div`,{className:`kc-tabs`,role:`tablist`,children:rn.map(e=>(0,B.jsxs)(`button`,{role:`tab`,"aria-selected":M===e.id,className:M===e.id?`active`:``,onClick:()=>j({tab:e.id}),children:[(0,B.jsx)(e.icon,{size:14}),` `,e.label]},e.id))}),(0,B.jsxs)(`div`,{className:`k-toolbar kc-toolbar`,children:[ve(`number`,[[`exact`,`Exact`,`Symbolic, exact results`],[`decimal`,`Decimal`,`Decimal results`],[`fraction`,`a/b`,`Fractions`]]),(0,B.jsx)(`label`,{className:`kc-inline`,title:`Significant digits (up to 1000)`,children:(0,B.jsxs)(`select`,{className:`k-input kc-small-select`,value:cn.includes(N.digits)?N.digits:``,onChange:e=>P({digits:Number(e.target.value)}),children:[!cn.includes(N.digits)&&(0,B.jsx)(`option`,{value:``,children:N.digits}),cn.map(e=>(0,B.jsxs)(`option`,{value:e,children:[e,` digits`]},e))]})}),(0,B.jsx)(`span`,{className:`k-sep`}),ve(`format`,[[`normal`,`Norm`,`Normal notation`],[`sci`,`Sci`,`Scientific notation`],[`eng`,`Eng`,`Engineering notation`],[`fix`,`Fix`,`Fixed decimals`]]),N.format!==`normal`&&(0,B.jsx)(`input`,{className:`k-input kc-num kc-fix`,type:`number`,min:0,max:100,value:N.fix,title:N.format===`fix`?`Decimals`:`Significant digits (0 = all)`,onChange:e=>P({fix:Math.max(0,Math.min(100,Number(e.target.value)||0))})}),(0,B.jsx)(`span`,{className:`k-sep`}),ve(`angle`,[[`deg`,`DEG`],[`rad`,`RAD`],[`grad`,`GRAD`]]),(0,B.jsx)(`span`,{className:`k-sep`}),ve(`complex`,[[`rect`,`a+bi`,`Rectangular complex numbers`],[`polar`,`r∠θ`,`Polar complex numbers`]]),(0,B.jsx)(`span`,{className:`k-spacer`}),V&&(0,B.jsxs)(`span`,{className:`kc-busy`,children:[(0,B.jsx)(F,{size:14,className:`k-spin`}),` computing… `,_e>=1?`${Math.floor(_e)} s`:``,(0,B.jsxs)(`button`,{className:`k-btn small danger`,onClick:me,title:`Stop (restarts Python; your session is kept) — Ctrl+.`,children:[(0,B.jsx)(D,{size:11}),` Cancel`]})]}),M===`calc`&&(0,B.jsxs)(B.Fragment,{children:[(0,B.jsx)(`button`,{className:`k-icon-btn${s.keypad?` active`:``}`,title:`Keypad`,onClick:()=>j({keypad:!s.keypad}),children:(0,B.jsx)(x,{size:16})}),(0,B.jsx)(`button`,{className:`k-icon-btn${s.side?` active`:``}`,title:`Variables & Catalog`,onClick:()=>j({side:!s.side}),children:(0,B.jsx)(C,{size:16})})]})]}),(0,B.jsxs)(`div`,{className:`kc-body`,children:[M===`calc`&&(0,B.jsx)(qe,{bridge:k,settings:N,history:n.history,vars:l,input:f,setInput:p,inputRef:m,evaluate:I,deleteEntry:te,clearHistory:()=>void L(),deleteVar:e=>void re(e),clearVars:()=>void ie(),showKeypad:s.keypad,showSide:s.side,busy:!!h&&h.op!==`preview`}),M===`graph`&&(0,B.jsx)(ft,{bridge:k,settings:N,graphs:n.graphs,setGraphs:e=>o(t=>({...t,graphs:e})),view:n.view,setView:e=>o(t=>({...t,view:e}))}),M===`matrix`&&(0,B.jsx)(yt,{settings:N,vars:l,evaluate:e=>I(e),insertToCalc:R,busy:!!h&&h.op!==`preview`}),M===`stats`&&(0,B.jsx)(Nt,{bridge:k,settings:N,lists:n.lists,setLists:e=>o(t=>({...t,lists:e})),evaluate:e=>I(e),addGraph:ae}),M===`units`&&(0,B.jsx)(It,{bridge:k,settings:N,insertToCalc:R}),M===`base`&&(0,B.jsx)(Qt,{settings:N,setSettings:P}),M===`python`&&(0,B.jsx)(en,{bridge:k,code:n.program,setCode:e=>o(t=>({...t,program:e})),onDefined:oe})]}),(0,B.jsxs)(`div`,{className:`k-statusbar kc-status`,children:[(0,B.jsx)(`span`,{children:y??(S===`off`?`Python not started`:S===`starting`?`Starting Python…`:S===`dead`?`Python stopped`:`Python ready`)}),(0,B.jsxs)(`span`,{children:[N.number===`exact`?`Exact`:N.number===`decimal`?`Decimal`:`Fraction`,` · `,N.digits,` digits · `,N.angle.toUpperCase(),` ·`,` `,N.format===`normal`?`Norm`:`${N.format.toUpperCase()} ${N.fix}`,` · `,N.complex===`rect`?`a+bi`:`r∠θ`]}),(0,B.jsxs)(`span`,{children:[n.history.length,` results · `,l.length,` variables`]}),(0,B.jsx)(`span`,{className:`k-spacer`}),(0,B.jsx)(`span`,{children:T?A(T):`autosaved`})]})]})}function un(){return r.dialog.alert((0,B.jsxs)(`div`,{className:`kc-help`,children:[(0,B.jsxs)(`p`,{children:[(0,B.jsx)(`b`,{children:`Typing.`}),` `,(0,B.jsx)(`code`,{children:`^`}),` or `,(0,B.jsx)(`code`,{children:`**`}),` powers, `,(0,B.jsx)(`code`,{children:`2x`}),` and `,(0,B.jsx)(`code`,{children:`sin x`}),` multiply/apply, `,(0,B.jsx)(`code`,{children:`5!`}),`, `,(0,B.jsx)(`code`,{children:`√2`}),`, `,(0,B.jsx)(`code`,{children:`π`}),`, `,(0,B.jsx)(`code`,{children:`e`}),`, `,(0,B.jsx)(`code`,{children:`i`}),`, `,(0,B.jsx)(`code`,{children:`oo`}),`. `,(0,B.jsx)(`code`,{children:`log`}),` is base 10, `,(0,B.jsx)(`code`,{children:`ln`}),` natural.`]}),(0,B.jsxs)(`p`,{children:[(0,B.jsx)(`b`,{children:`Answers.`}),` `,(0,B.jsx)(`code`,{children:`ans`}),` = `,(0,B.jsx)(`code`,{children:`ans1`}),` is the last result, `,(0,B.jsx)(`code`,{children:`ans2`}),` the one before… Click a result to insert it, an input to reuse it, ✎ to edit it in place.`]}),(0,B.jsxs)(`p`,{children:[(0,B.jsx)(`b`,{children:`Define.`}),` `,(0,B.jsx)(`code`,{children:`a := 5`}),`, `,(0,B.jsx)(`code`,{children:`f(x, y) := x^2 + y`}),`, or store: `,(0,B.jsx)(`code`,{children:`7 → b`}),`.`]}),(0,B.jsxs)(`p`,{children:[(0,B.jsx)(`b`,{children:`Equations.`}),` `,(0,B.jsx)(`code`,{children:`solve(x^2 = 2, x)`}),`, `,(0,B.jsx)(`code`,{children:`solve([x+y=3, x-y=1], [x,y])`}),`, `,(0,B.jsx)(`code`,{children:`nsolve(cos x = x, x, 1)`}),`, `,(0,B.jsx)(`code`,{children:`roots(x^3 - 1)`}),`, `,(0,B.jsx)(`code`,{children:`dsolve(y'' + y = 0, y(0) = 1, y'(0) = 0)`}),`.`]}),(0,B.jsxs)(`p`,{children:[(0,B.jsx)(`b`,{children:`Calculus.`}),` `,(0,B.jsx)(`code`,{children:`diff(f, x, 2)`}),`, `,(0,B.jsx)(`code`,{children:`integrate(f, x)`}),`, `,(0,B.jsx)(`code`,{children:`integrate(f, x, 0, 1)`}),`, `,(0,B.jsx)(`code`,{children:`nint(f, x, a, b)`}),`, `,(0,B.jsx)(`code`,{children:`limit(f, x, 0, "+")`}),`, `,(0,B.jsx)(`code`,{children:`taylor(f, x, 0, 8)`}),`, `,(0,B.jsx)(`code`,{children:`sum(1/k^2, k, 1, oo)`}),`.`]}),(0,B.jsxs)(`p`,{children:[(0,B.jsx)(`b`,{children:`Matrices.`}),` `,(0,B.jsx)(`code`,{children:`[[1,2],[3,4]]`}),`, `,(0,B.jsx)(`code`,{children:`A^-1`}),`, `,(0,B.jsx)(`code`,{children:`det(A)`}),`, `,(0,B.jsx)(`code`,{children:`eig(A)`}),`, `,(0,B.jsx)(`code`,{children:`lu(A)`}),`, `,(0,B.jsx)(`code`,{children:`svd(A)`}),`, `,(0,B.jsx)(`code`,{children:`linsolve(A, b)`}),`; vectors `,(0,B.jsx)(`code`,{children:`[1,2,3]`}),`, `,(0,B.jsx)(`code`,{children:`cross(u, v)`}),`. Indexes start at 0: `,(0,B.jsx)(`code`,{children:`A[0, 1]`}),`.`]}),(0,B.jsxs)(`p`,{children:[(0,B.jsx)(`b`,{children:`Units.`}),` `,(0,B.jsx)(`code`,{children:`3_m/_s * 2_h`}),`, `,(0,B.jsx)(`code`,{children:`100_km/_h ▶ _m/_s`}),` (or `,(0,B.jsx)(`code`,{children:`->`}),`), `,(0,B.jsx)(`code`,{children:`20°C ▶ °F`}),`, prefixes on SI units (`,(0,B.jsx)(`code`,{children:`_µm`}),`, `,(0,B.jsx)(`code`,{children:`_MPa`}),`).`]}),(0,B.jsxs)(`p`,{children:[(0,B.jsx)(`b`,{children:`Constants.`}),` `,(0,B.jsx)(`code`,{children:`#c`}),`, `,(0,B.jsx)(`code`,{children:`#h`}),`, `,(0,B.jsx)(`code`,{children:`#hbar`}),`, `,(0,B.jsx)(`code`,{children:`#e`}),`, `,(0,B.jsx)(`code`,{children:`#me`}),`, `,(0,B.jsx)(`code`,{children:`#NA`}),`, `,(0,B.jsx)(`code`,{children:`#kB`}),`… or any CODATA name: `,(0,B.jsx)(`code`,{children:`const("muon mass")`}),`.`]}),(0,B.jsxs)(`p`,{children:[(0,B.jsx)(`b`,{children:`Complex.`}),` `,(0,B.jsx)(`code`,{children:`3 + 4i`}),`, `,(0,B.jsx)(`code`,{children:`5∠30°`}),`, `,(0,B.jsx)(`code`,{children:`abs`}),`, `,(0,B.jsx)(`code`,{children:`arg`}),`, `,(0,B.jsx)(`code`,{children:`conj`}),`. `,(0,B.jsx)(`b`,{children:`Statistics.`}),` lists `,(0,B.jsx)(`code`,{children:`L1`}),`…`,(0,B.jsx)(`code`,{children:`L6`}),` from the Statistics tab: `,(0,B.jsx)(`code`,{children:`mean(L1)`}),`.`]}),(0,B.jsxs)(`p`,{children:[(0,B.jsx)(`b`,{children:`Keys.`}),` Enter calculates, Ctrl+Enter gives a decimal, ↑/↓ recall, Tab completes, Esc clears, Ctrl+. cancels, Ctrl+1…7 switch tabs.`]})]}),{title:`kCalc syntax`})}export{ln as default};