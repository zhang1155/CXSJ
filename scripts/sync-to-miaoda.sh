#!/bin/bash
# ============================================================
# miaoda-sync — 将本地修改同步到秒哒平台并发布
# 
# 用法：
#   ./scripts/sync-to-miaoda.sh                  # 同步所有修改过的文件并发布
#   ./scripts/sync-to-miaoda.sh --skip-publish   # 只同步文件，不发布
#   ./scripts/sync-to-miaoda.sh --file src/components/AIGenerator.tsx  # 只同步指定文件
# ============================================================
set -e

MIAODA_SKILL_DIR="$HOME/.hermes/skills/miaoda-app-builder"
APP_ID="app-b7xiaa8vv30h"
WORKSPACE="/workspace/app-b7xiaa8vv30h"
LOCAL_DIR="$HOME/projects/miaoda-ppt"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Miaoda Sync — 同步到秒哒平台    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"

# ---- 参数解析 ----
SKIP_PUBLISH=false
SPECIFIC_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-publish) SKIP_PUBLISH=true; shift ;;
    --file) SPECIFIC_FILE="$2"; shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

# ---- 1. 检查要同步的文件 ----
cd "$LOCAL_DIR"

if [ -n "$SPECIFIC_FILE" ]; then
  # 只同步指定文件
  CHANGED_FILES=("$SPECIFIC_FILE")
  echo -e "${YELLOW}指定文件: $SPECIFIC_FILE${NC}"
else
  # 获取所有已修改的文件（相对于上次 commit）
  CHANGED_FILES=($(git diff --name-only HEAD -- 'src/' 'supabase/' | head -20))
  if [ ${#CHANGED_FILES[@]} -eq 0 ]; then
    echo -e "${GREEN}✔ 没有需要同步的文件${NC}"
    exit 0
  fi
  echo -e "${YELLOW}检测到 ${#CHANGED_FILES[@]} 个文件已修改:${NC}"
  for f in "${CHANGED_FILES[@]}"; do
    echo "   - $f"
  done
fi

echo ""

# ---- 2. 获取秒哒 conversationId ----
echo -e "${BLUE}[1/3] 获取秒哒会话 ID...${NC}"
API_KEY=$(grep MIAODA_API_KEY "$MIAODA_SKILL_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')
if [ -z "$API_KEY" ]; then
  API_KEY="$MIAODA_API_KEY"
fi

if [ -z "$API_KEY" ]; then
  echo -e "${RED}✘ 未找到 MIAODA_API_KEY，请在 .env 文件中设置${NC}"
  exit 1
fi

# 获取 app-detail 中的 conversationId
DETAIL=$(python3 "$MIAODA_SKILL_DIR/scripts/miaoda_api.py" app-detail --app-id "$APP_ID" --no-context 2>/dev/null)
CONV_ID=$(echo "$DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('conversationId',''))" 2>/dev/null)

if [ -z "$CONV_ID" ] || [ "$CONV_ID" = "None" ]; then
  echo -e "${YELLOW}未找到 conversationId，尝试从轨迹恢复...${NC}"
  CONV_ID=$(python3 "$MIAODA_SKILL_DIR/scripts/miaoda_api.py" get-context-id --app-id "$APP_ID" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('conversationId',''))" 2>/dev/null)
fi

if [ -z "$CONV_ID" ] || [ "$CONV_ID" = "None" ]; then
  echo -e "${RED}✘ 无法获取 conversationId${NC}"
  exit 1
fi
echo -e "${GREEN}✔ 会话 ID: $CONV_ID${NC}"

# ---- 3. 逐个文件同步 ----
echo -e "${BLUE}[2/3] 同步文件到秒哒...${NC}"
SUCCESS_COUNT=0
FAIL_COUNT=0

for FILE in "${CHANGED_FILES[@]}"; do
  # 检查文件是否存在
  LOCAL_FILE="$LOCAL_DIR/$FILE"
  if [ ! -f "$LOCAL_FILE" ]; then
    echo -e "${YELLOW}   ⚠ 本地文件不存在: $FILE (可能是新增文件，跳过)${NC}"
    continue
  fi

  # 检查文件大小
  FILE_SIZE=$(wc -c < "$LOCAL_FILE")
  if [ "$FILE_SIZE" -gt 50000 ]; then
    echo -e "${YELLOW}   ⚠ 文件过大($((FILE_SIZE/1024))KB)，跳过: $FILE${NC}"
    echo -e "${YELLOW}     超大文件建议手动处理${NC}"
    continue
  fi

  REMOTE_PATH="$WORKSPACE/$FILE"
  echo -e "   → 同步: $FILE"

  # 读取文件内容并转义
  FILE_CONTENT=$(cat "$LOCAL_FILE")

  # 通过 chat --no-stream 发送文件替换指令
  RESULT=$(MIAODA_API_KEY="$API_KEY" python3 "$MIAODA_SKILL_DIR/scripts/miaoda_api.py" chat \
    --text "请将文件 $REMOTE_PATH 的完整内容替换为以下代码，不要做任何其他修改，不要分析，不要优化，只做文件替换：

\`\`\`
$FILE_CONTENT
\`\`\`

替换完成后告诉我结果。" \
    --app-id "$APP_ID" \
    --context-id "$CONV_ID" \
    --no-stream 2>/dev/null)

  # 检查是否成功（检查轨迹中的 terminal 状态）
  sleep 5
  TRAJ=$(python3 "$MIAODA_SKILL_DIR/scripts/miaoda_api.py" fetch-trajectory --app-id "$APP_ID" --last-event-id -1 --fetch-timeout 10 2>/dev/null)
  IS_TERMINAL=$(echo "$TRAJ" | grep '"isTerminal": true' | head -1)

  if [ -n "$IS_TERMINAL" ]; then
    echo -e "${GREEN}   ✔ $FILE 同步成功${NC}"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo -e "${RED}   ✘ $FILE 同步可能失败，请检查${NC}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo -e "${GREEN}✔ 同步完成: $SUCCESS_COUNT 成功, $FAIL_COUNT 失败${NC}"

# ---- 4. 发布 ----
if [ "$SKIP_PUBLISH" = true ] || [ "$FAIL_COUNT" -gt 0 ]; then
  if [ "$SKIP_PUBLISH" = true ]; then
    echo -e "${YELLOW}⏩ 跳过发布 (--skip-publish)${NC}"
  else
    echo -e "${RED}⏩ 有文件同步失败，跳过发布${NC}"
  fi
  exit 0
fi

echo ""
echo -e "${BLUE}[3/3] 发布到生产环境...${NC}"
MIAODA_API_KEY="$API_KEY" python3 "$MIAODA_SKILL_DIR/scripts/miaoda_api.py" publish --app-id "$APP_ID" --wait

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      🚀 发布完成！                   ║${NC}"
echo -e "${GREEN}║      https://$APP_ID.appmiaoda.com   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
