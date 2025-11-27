# Gust 全面重構優化計劃

## 1. Bug 修復 (High Priority)

### 1.1 Missing Exports
- `prefix` 同 `merge` 喺 router.ts export 咗但 index.ts 無 re-export
- 需要加入 index.ts

## 2. Code Quality (Medium Priority)

### 2.1 統一錯誤響應模式
將 `response(JSON.stringify({ error: '...' }), {...})` 改用 `json()` helper：
- auth.ts (4處)
- csrf.ts (2處)
- jwt.ts (1處)
- rateLimit.ts (2處)
- health.ts (1處)

### 2.2 移除 `group()` (Legacy)
- router.ts 有 `group()` 標記為 legacy
- 應該用 `prefix()` 取代
- 可以 deprecate 或移除

## 3. Bundle Size 優化 (High Priority)

### 3.1 Tree-shaking 改善
當前問題：所有 middleware 都會被打包即使無用

方案 A：拆分 sub-packages (推薦)
```
@sylphx/gust          - core + router + basic middleware
@sylphx/gust/auth     - auth middleware
@sylphx/gust/otel     - OpenTelemetry (581 lines, 最大)
@sylphx/gust/validate - validation (471 lines)
@sylphx/gust/cluster  - cluster mode (Node.js only)
@sylphx/gust/http2    - HTTP/2 support
```

方案 B：保持單一 package，靠 bundler tree-shake
- 風險：bundler 可能無法完全 tree-shake

### 3.2 WASM 優化
- 當前：60KB raw, 28KB gzipped
- 可考慮：wasm-opt 進一步壓縮
- 可考慮：lazy load WASM (只喺用到 router 時先 load)

## 4. Performance 優化 (Medium Priority)

### 4.1 避免重複 JSON.stringify
- otel.ts MetricsCollector 用 `JSON.stringify(attributes)` 做比較
- 可以用 Map key 優化

### 4.2 Router 優化
- 當前：每次 request 都 call `initRouter()`
- 優化：static initialization

### 4.3 減少 WeakMap 使用
- 多處用 WeakMap 存 context state
- 可以直接擴展 context object

## 5. Type Safety 改善 (Low Priority)

### 5.1 減少 type assertions
- 搜索 `as ` 同 `!` 使用
- 盡量用 type guards 取代

### 5.2 更嚴格嘅 types
- 部分 Record<string, string> 可以更具體

## 6. 代碼組織 (Low Priority)

### 6.1 拆分大文件
- otel.ts (581 lines) → otel/tracing.ts + otel/metrics.ts
- validate.ts (471 lines) → validate/schema.ts + validate/middleware.ts

### 6.2 統一 naming conventions
- 部分用 camelCase，部分用 snake_case (header names)
- 統一風格

## 建議執行順序

1. **Phase 1 (必做)**
   - [ ] 修復 missing exports (prefix, merge)
   - [ ] 統一錯誤響應用 json()
   - [ ] 移除/deprecate legacy group()

2. **Phase 2 (優化)**
   - [ ] Router static initialization
   - [ ] 減少 JSON.stringify 比較

3. **Phase 3 (可選)**
   - [ ] 拆分 sub-packages
   - [ ] WASM lazy loading
   - [ ] 拆分大文件

## 預期效果

| Metric | Before | After |
|--------|--------|-------|
| Bundle (gzipped) | 166 KB | ~150 KB |
| Tree-shakeable | ❌ | ✅ |
| Type errors | 0 | 0 |
| Test coverage | 100% | 100% |
