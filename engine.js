function macroOptional(rule, str) {
  let m = this.match(rule);
  console.log(m);
  if (!m[0]) return [true, 0];
  this.index -= m[1];
  return m;
}

function macroWs(_, str) {
  let bl = str.length;
  str = str.trimStart();
  let al = str.length;
  return [true, bl - al];
}

function macroZeroOrMore(rule, str) {
  let res = [],
    i = 0;
  const l = str.length;
  while (i < l) {
    let m = this.match(rule);
    if (!m.shift()) break;
    i += m.shift();
    res.push(...m);
  }
  this.index -= i;
  return [true, i, res];
}

function macroOneOrMore(rule, str) {
  let f = this.match(rule);
  if (!f[0]) return f;
  this.index -= f[1];
  return macroZeroOrMore.call(this, rule, str);
}

function macroAnyUntil(rule, str) {
  let found = false,
    i = 0,
    res = "",
    del = "",
    skip = false;
  const l = str.length;
  while (i < l) {
    if (str[i] == "\\") {
      skip = true;
      i++;
    }
    let m = this.match(rule);
    if (m[0] && !skip) {
      found = true;
      del = m[2];
      i += m[1];
      break;
    }
    skip = false;
    res = res.concat(str[i++]);
    this.index++;
  }
  this.index -= i;
  return [found, i, res, del];
}

class ParserEngine {
  static TYPES = Object.freeze({
    rule: 0,
    string: 1,
    range: 2,
    seq: 3,
    option: 4,
    macro: 5,
  });
  $rules = new Map();
  $macros = new Map();
  $postprocessors = new Map();
  main_rule = null;
  originalStr = "";
  index = 0;
  createMacro(name, fn) {
    this.$macros.set(name, fn);
  }
  createRule(name, definition, postprocessor) {
    this.$rules[name] = {
      name,
      value: definition,
      postprocessor,
    };
  }
  createPostprocessor(name, fn) {
    this.$postprocessors.set(name, fn);
  }
  loadFuncs(obj) {
    for (let k in obj) {
      this.$postprocessors.set(k, obj[k]);
    }
  }
  match(def) {
    let str = this.originalStr.slice(this.index);
    let x = this["match" + def.type](def.value, str);
    if (x[0]) this.index += x[1];
    return x;
  }
  match0(name, str) {
    let rule = this.$rules.get(name);
    if (!rule) throw new Error("Rule '" + name + "' is missing");
    let res = this.match(rule.value, str),
      ppname;
    if (!res || !res[0]) return res;
    if (name == "macro") console.log(res);
    this.index -= res[1];
    if (!!(ppname = rule.postprocessor)) {
      let pp = this.$postprocessors.get(ppname);
      if (!pp) console.warn("Postprocessor '" + ppname + "' is missing");
      else res[2] = pp(res[2]);
    }
    return res;
  }
  match1(pat, str) {
    if (pat.length == 1) return [str[0] == pat, 1, pat];
    let rstr = "",
      c = 0;
    for (let l = pat.length; c < l; c++) {
      let x = pat[c] == str[c];
      if (!x) return [false];
      rstr.push(str[c]);
    }
    return [true, c, rstr];
  }
  match2(rule, str) {
    let start = rule[0].charCodeAt(0),
      end = rule[1].charCodeAt(0),
      cc = str.charCodeAt(0);
    if (cc < start || cc > end) return [false];
    return [true, 1, str[0]];
  }
  match3(seq, str) {
    let p = this.index,
      ret = [];
    for (let c = 0, l = seq.length; c < l; c++) {
      let m = this.match(seq[c]);
      if (!m[0]) {
        return [false];
      }
      console.log(ret, m.slice(2));
      ret.push(...m.slice(2));
    }
    let d = this.index - p;
    this.index = p;
    return [true, d, ret];
  }
  match4(opts, str) {
    let result = null;
    for (let c = 0, l = opts.length; c < l; c++) {
      let cres = this.match(opts[c], str);
      if (!cres[0]) continue;
      this.index -= cres[1];
      if (!result || cres[1] > result[1]) result = cres;
    }
    return result || [false];
  }
  match5(name, str) {
    let arg;
    if (typeof name == "object") {
      [name, arg] = name;
    }
    let macro = this.$macros.get(name);
    let x = macro.call(this, arg, str);
    return x;
  }
  constructor(rules, main_rule) {
    this.createMacro("optional", macroOptional);
    this.createMacro("ws", macroWs);
    this.createMacro("zero_or_more", macroZeroOrMore);
    this.createMacro("one_or_more", macroOneOrMore);
    this.createMacro("any_until", macroAnyUntil);
    this.main_rule = main_rule;
    for (let rule of rules) {
      this.$rules.set(rule.name, rule);
    }
  }
  execute(string) {
    this.originalStr = string;
    return this.match({ type: ParserEngine.TYPES.rule, value: this.main_rule });
  }
}

module.exports = ParserEngine;
