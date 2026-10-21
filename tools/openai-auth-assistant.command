#!/bin/zsh
set -e
assistant_dir=${0:A:h}
assistant_node=''
for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; do
  if [[ -x "$candidate" ]]; then assistant_node="$candidate"; break; fi
done
if [[ -z "$assistant_node" ]] && command -v node >/dev/null 2>&1; then assistant_node=$(command -v node); fi
if [[ -z "$assistant_node" ]]; then
  print '未找到 Node.js。请安装 Node.js 22 或以上版本后再次打开授权助手。'
  read 'assistant_reply?按回车退出。'
  exit 1
fi
print '请保留此窗口，并在荣县一中模型工作台中发起官方授权。关闭本窗口即可退出助手。'
exec "$assistant_node" "$assistant_dir/openai-auth-assistant.cjs"
