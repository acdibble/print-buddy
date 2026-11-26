// oxlint is run without file arguments because it errors when every passed
// file is ignored (e.g. only tests are staged); ignores live in .oxlintrc.json
export default {
  '*.ts': () => 'oxlint',
  '*': 'oxfmt --no-error-on-unmatched-pattern',
};
