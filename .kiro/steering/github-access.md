---
inclusion: manual
---

# GitHub Access

## Authentication

The GitHub CLI (`gh`) requires authentication. To get the token from Windows Credential Manager:

```powershell
$cred = "protocol=https`nhost=github.com`n" | git credential fill
# Extract the password line which contains the GitHub token
$env:GH_TOKEN = ($cred | Select-String "password=").ToString().Replace("password=","")
```

Set `$env:GH_TOKEN` before any `gh` command.

## Repository

- Repo: `kranthiCareCareer/CareCareer` (private)
- Owner: kranthiCareCareer
- Default branch: master

## PR Management

- Use `gh pr close` for closing PRs (works with repo scope)
- Use REST API `PATCH /repos/{owner}/{repo}/pulls/{number}` for editing title/body
- `gh pr edit` requires `read:org` scope which the token may lack — use REST API instead:

```powershell
$body = @{ title = "PR title"; body = "PR description" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.github.com/repos/kranthiCareCareer/CareCareer/pulls/{number}" `
  -Method PATCH `
  -Headers @{ Authorization = "Bearer $env:GH_TOKEN"; Accept = "application/vnd.github+json" } `
  -Body $body -ContentType "application/json"
```

## Rules

- Always authenticate before gh commands
- Only one active PR at a time (close stale ones immediately)
- Keep PR descriptions comprehensive with test evidence
- Push to feature branches, never directly to master
- Never commit tokens or secrets to source
