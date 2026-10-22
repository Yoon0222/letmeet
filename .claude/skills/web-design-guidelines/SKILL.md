---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the guidelines in `guidelines.md` (this folder)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

The rules are in `guidelines.md` next to this file — a saved copy of
`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
(see `SOURCE.md` for the version). Read that file; do not fetch the URL at review time.

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines.md`
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.

## 피넛에서 쓸 때

- 관리자 웹(`web-admin/`, Next.js)과 랜딩 페이지에는 규칙을 그대로 적용한다.
- 앱(Expo React Native)에는 웹 전용 규칙(aria-*, CSS, `<a>`/`<button>` 태그, hydration)은 빼고, 접근성·애니메이션·폼·빈 화면·긴 글자 처리 원칙만 참고한다. 앱 쪽 성능·구조 규칙은 `vercel-react-native-skills` 를 본다.
- 화면 문구는 한국어라 Title Case·영어 따옴표 같은 영어 문구 규칙은 적용하지 않는다(존댓말 "~해요" 톤 유지).
