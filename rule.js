// Biraz daha ilkel, dağınık bir match systemi.
// Çalıştığına inanıyorum.

const MATCH_TYPES = {
  rule: 0,
  str: 1,
  range: 2,
  seq: 3,
  option: 4,
  macro: 5,
};

const add = {
  rule: (value) => ({ type: MATCH_TYPES.rule, value }),
  str: (value) => ({ type: MATCH_TYPES.str, value }),
  range: (start, end) => ({ type: MATCH_TYPES.range, value: [start, end] }),
  seq: (...args) => ({ type: MATCH_TYPES.seq, value: args }),
  option: (...opts) => ({ type: MATCH_TYPES.option, value: opts }),
  macro: (name, value) => ({
    type: MATCH_TYPES.macro,
    value: value ? [name, value] : name,
  }),
};

const match = {
  $(rule, str) {
    return this[rule.type](rule.value, str, this.$);
  },
  [MATCH_TYPES.rule](name, str) {
    let rule = $rules[name],
      val = rule.value;
    let res = this.$(val, str);
    if (res[0] && (pp = rule.meta.postprocessor)) {
      res[2] = pp(res[2]);
    }

    return res;
  },
  [MATCH_TYPES.str](rule, str) {
    if (rule.length == 1) return [str[0] == rule, 1, str[0]];
    let rstr = "",
      c = 0;
    for (let l = rule.length; c < l; c++) {
      let x = rule[c] == str[c];
      if (!x) return [false];
      rstr.push(str[c]);
    }
    return [true, c, rstr];
  },
  [MATCH_TYPES.range](rule, str) {
    let start = rule[0].charCodeAt(0),
      end = rule[1].charCodeAt(0),
      cc = str.charCodeAt(0);

    return [cc >= start && cc <= end, 1, str[0]];
  },
  [MATCH_TYPES.seq](rule, str) {
    let i = 0,
      ret = [];
    for (let c = 0, l = rule.length; c < l; c++) {
      let m = this.$(rule[c], str.slice(i));
      if (!m.shift()) {
        return [false];
      }
      i += m.shift();
      ret.push(...m);
    }
    return [true, i, ret];
  },
  [MATCH_TYPES.option](rule, str) {
    let result = null;
    for (let c = 0, l = rule.length; c < l; c++) {
      let cres = this.$(rule[c], str);
      if (!cres[0]) continue;
      if (!result || cres[1] > result[1]) result = cres;
    }
    return result || [false];
  },
  [MATCH_TYPES.macro](name, str) {
    let rule;
    if (typeof name == "object") {
      [name, rule] = name;
    }
    let macro = $macros[name].value;
    return macro(rule, str, this.$.bind(this));
  },
};

const $rules = {},
  $macros = {};

const create = {
  rule(name, value, postprocessor) {
    let obj = {
      type: "rule",
      value,
      name,
      meta: { postprocessor },
    };
    $rules[name] = obj;
  },
  macro(name, fn) {
    $macros[name] = {
      type: "macro",
      value: fn,
    };
  },
};

create.macro("optional", (rule, str, $) => {
  let m = $(rule, str);
  if (!m[0]) return [true, 0];
  return m;
});
create.macro("zero_or_more", (rule, str, $) => {
  let res = [],
    i = 0;
  const l = str.length;
  while (i <= l) {
    let m = $(rule, str.slice(i));
    if (!m.shift()) break;
    i += m.shift();
    res.push(...m);
  }
  return [true, i, res];
});
create.macro("one_or_more", (rule, str, $) => {
  let f = $(rule, str);
  if (!f[0]) return f;
  return $(add.macro("zero_or_more", rule), str);
});
create.macro("any_until", (rule, str, $) => {
  let found = false,
    i = 0,
    res = [],
    alt = false;
  const l = str.length;
  while (i < l) {
    if (str[i] == "\\") {
      alt = true;
      i++;
    }
    let m = $(rule, str.slice(i));
    if (m[0] && !alt) {
      found = true;
      i += m[1];
      break;
    }
    alt = false;
    res.push(str[i]);
    i++;
  }
  return [found, i, res];
});
create.macro("ws", (_, str) => {
  let bl = str.length;
  str = str.trimStart();
  let al = str.length;
  return [true, bl - al];
});

module.exports = {
  add,
  create,
  match(x, s) {
    return match.$(x, s);
  },
};
