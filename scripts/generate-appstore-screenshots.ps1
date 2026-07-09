Add-Type -AssemblyName System.Drawing

$W = 1242
$H = 2688
$OutDir = Join-Path (Get-Location) 'docs\appstore-screenshots\iphone-6-5'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$C = @{
  Bg = [System.Drawing.ColorTranslator]::FromHtml('#F6F7F9')
  Dark = [System.Drawing.ColorTranslator]::FromHtml('#111827')
  Green = [System.Drawing.ColorTranslator]::FromHtml('#16C784')
  GreenDark = [System.Drawing.ColorTranslator]::FromHtml('#0F8F5F')
  Text2 = [System.Drawing.ColorTranslator]::FromHtml('#6B7280')
  Muted = [System.Drawing.ColorTranslator]::FromHtml('#9CA3AF')
  Border = [System.Drawing.ColorTranslator]::FromHtml('#E5E7EB')
  White = [System.Drawing.ColorTranslator]::FromHtml('#FFFFFF')
  WarnBg = [System.Drawing.ColorTranslator]::FromHtml('#FEF3C7')
  Warn = [System.Drawing.ColorTranslator]::FromHtml('#D97706')
  SuccessBg = [System.Drawing.ColorTranslator]::FromHtml('#DCFCE7')
}

$Fonts = @{
  Title = New-Object System.Drawing.Font('Malgun Gothic', 58, [System.Drawing.FontStyle]::Bold)
  Sub = New-Object System.Drawing.Font('Malgun Gothic', 34, [System.Drawing.FontStyle]::Regular)
  H = New-Object System.Drawing.Font('Malgun Gothic', 42, [System.Drawing.FontStyle]::Bold)
  Body = New-Object System.Drawing.Font('Malgun Gothic', 27, [System.Drawing.FontStyle]::Regular)
  Small = New-Object System.Drawing.Font('Malgun Gothic', 22, [System.Drawing.FontStyle]::Regular)
  TinyBold = New-Object System.Drawing.Font('Malgun Gothic', 20, [System.Drawing.FontStyle]::Bold)
  Logo = New-Object System.Drawing.Font('Arial', 42, [System.Drawing.FontStyle]::Bold)
}

function Brush($Color) { New-Object System.Drawing.SolidBrush($Color) }
function PenC($Color, $Width = 1) { New-Object System.Drawing.Pen($Color, $Width) }

function RoundedPath($X, $Y, $Width, $Height, $Radius) {
  $Path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $D = $Radius * 2
  $Path.AddArc($X, $Y, $D, $D, 180, 90)
  $Path.AddArc($X + $Width - $D, $Y, $D, $D, 270, 90)
  $Path.AddArc($X + $Width - $D, $Y + $Height - $D, $D, $D, 0, 90)
  $Path.AddArc($X, $Y + $Height - $D, $D, $D, 90, 90)
  $Path.CloseFigure()
  return $Path
}

function FillRound($G, $X, $Y, $Width, $Height, $Radius, $Color) {
  $Path = RoundedPath $X $Y $Width $Height $Radius
  $G.FillPath((Brush $Color), $Path)
  $Path.Dispose()
}

function StrokeRound($G, $X, $Y, $Width, $Height, $Radius, $Color, $Stroke = 1) {
  $Path = RoundedPath $X $Y $Width $Height $Radius
  $G.DrawPath((PenC $Color $Stroke), $Path)
  $Path.Dispose()
}

function DrawText($G, $Text, $Font, $Color, $X, $Y, $Width = 1000, $Height = 120) {
  $Format = New-Object System.Drawing.StringFormat
  $Format.Alignment = [System.Drawing.StringAlignment]::Near
  $Format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $G.DrawString($Text, $Font, (Brush $Color), (New-Object System.Drawing.RectangleF($X, $Y, $Width, $Height)), $Format)
  $Format.Dispose()
}

function DrawCenter($G, $Text, $Font, $Color, $X, $Y, $Width, $Height) {
  $Format = New-Object System.Drawing.StringFormat
  $Format.Alignment = [System.Drawing.StringAlignment]::Center
  $Format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $G.DrawString($Text, $Font, (Brush $Color), (New-Object System.Drawing.RectangleF($X, $Y, $Width, $Height)), $Format)
  $Format.Dispose()
}

function DrawPill($G, $Text, $X, $Y, $Width, $Bg, $Fg) {
  FillRound $G $X $Y $Width 38 19 $Bg
  DrawCenter $G $Text $Fonts.TinyBold $Fg $X $Y $Width 38
}

function DrawCard($G, $X, $Y, $Width, $Height) {
  FillRound $G $X $Y $Width $Height 28 $C.White
  StrokeRound $G $X $Y $Width $Height 28 $C.Border 1
}

function DrawHeader($G, $Eyebrow, $Title, $Subtitle, $DarkMode) {
  $TitleColor = if ($DarkMode) { $C.White } else { $C.Dark }
  $SubColor = if ($DarkMode) { [System.Drawing.Color]::FromArgb(210,255,255,255) } else { $C.Text2 }
  DrawText $G $Eyebrow $Fonts.TinyBold $C.Green 86 116 900 48
  DrawText $G $Title $Fonts.Title $TitleColor 86 170 1000 170
  DrawText $G $Subtitle $Fonts.Sub $SubColor 88 345 1000 120
}

function DrawPhone($G) {
  $PX = 244; $PY = 560; $PW = 754; $PH = 1940
  FillRound $G ($PX - 18) ($PY - 18) ($PW + 36) ($PH + 36) 72 ([System.Drawing.Color]::FromArgb(40,0,0,0))
  FillRound $G $PX $PY $PW $PH 62 $C.Dark
  FillRound $G ($PX + 20) ($PY + 20) ($PW - 40) ($PH - 40) 48 $C.Bg
  FillRound $G ($PX + 286) ($PY + 30) 180 26 13 $C.Dark
  return @{ X = $PX + 20; Y = $PY + 20; W = $PW - 40; H = $PH - 40 }
}

function DrawAppTop($G, $S) {
  FillRound $G ($S.X + 26) ($S.Y + 34) 54 54 20 $C.Green
  DrawCenter $G 'P!' $Fonts.TinyBold $C.White ($S.X + 26) ($S.Y + 34) 54 54
  DrawText $G '안녕하세요, 관리자님' $Fonts.Body $C.Dark ($S.X + 96) ($S.Y + 28) 460 40
  DrawText $G '서울 송파구 · 실력 3.5' $Fonts.Small $C.Text2 ($S.X + 96) ($S.Y + 68) 430 34
  FillRound $G ($S.X + $S.W - 80) ($S.Y + 34) 48 48 18 $C.White
  DrawCenter $G '!' $Fonts.TinyBold $C.Dark ($S.X + $S.W - 80) ($S.Y + 34) 48 48
}

function SaveShot($Name, $Eyebrow, $Title, $Subtitle, $DarkMode) {
  $Bitmap = New-Object System.Drawing.Bitmap($W, $H)
  $G = [System.Drawing.Graphics]::FromImage($Bitmap)
  $G.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $G.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $G.Clear($(if ($DarkMode) { $C.Dark } else { $C.Bg }))

  DrawHeader $G $Eyebrow $Title $Subtitle $DarkMode
  $S = DrawPhone $G
  DrawAppTop $G $S

  if ($Name -eq '01-home') {
    FillRound $G ($S.X + 34) ($S.Y + 135) ($S.W - 68) 300 32 $C.Dark
    DrawText $G '오늘 참가 가능한 경기' $Fonts.Small $C.Green ($S.X + 60) ($S.Y + 165) 500 36
    DrawText $G '퇴근 후 더블스' $Fonts.H $C.White ($S.X + 60) ($S.Y + 212) 500 70
    DrawText $G '19:30 · 잠실 · 3/4명 모집중' $Fonts.Body ([System.Drawing.Color]::FromArgb(210,255,255,255)) ($S.X + 60) ($S.Y + 292) 540 46
    FillRound $G ($S.X + 60) ($S.Y + 355) 150 52 20 $C.Green
    DrawCenter $G '참가하기' $Fonts.TinyBold $C.White ($S.X + 60) ($S.Y + 355) 150 52
    $Labels = @('번개모임', '코트예약', '대회')
    for ($I = 0; $I -lt 3; $I++) {
      DrawCard $G ($S.X + 34 + $I * 216) ($S.Y + 470) 192 130
      DrawCenter $G $Labels[$I] $Fonts.TinyBold $C.Dark ($S.X + 34 + $I * 216) ($S.Y + 516) 192 40
    }
    DrawText $G '다가오는 내 일정' $Fonts.H $C.Dark ($S.X + 34) ($S.Y + 650) 500 70
    DrawCard $G ($S.X + 34) ($S.Y + 735) ($S.W - 68) 118
    DrawPill $G 'PLAY' ($S.X + 58) ($S.Y + 775) 90 $C.SuccessBg $C.GreenDark
    DrawText $G '강남 오픈 플레이' $Fonts.Body $C.Dark ($S.X + 170) ($S.Y + 765) 390 40
    DrawText $G '내일 20:00 · 강남' $Fonts.Small $C.Text2 ($S.X + 170) ($S.Y + 805) 390 34
  }

  if ($Name -eq '02-matches') {
    DrawText $G '번개 모임' $Fonts.H $C.Dark ($S.X + 34) ($S.Y + 135) 400 70
    DrawText $G '가까운 코트에서 함께 칠 사람을 찾아보세요' $Fonts.Small $C.Text2 ($S.X + 34) ($S.Y + 200) 600 40
    $Chips = @('전체','송파','강남','마포')
    for ($I = 0; $I -lt 4; $I++) {
      DrawPill $G $Chips[$I] ($S.X + 34 + $I * 128) ($S.Y + 265) 108 $(if ($I -eq 0) { $C.Green } else { $C.White }) $(if ($I -eq 0) { $C.White } else { $C.Text2 })
    }
    $Titles = @('퇴근 후 더블스','아침 랠리','주말 믹스 게임','초보 환영 게임')
    $Times = @('오늘 19:30','내일 07:00','토요일 15:00','일요일 09:00')
    for ($I = 0; $I -lt 4; $I++) {
      $Y = $S.Y + 340 + $I * 220
      DrawCard $G ($S.X + 34) $Y ($S.W - 68) 185
      DrawText $G $Times[$I] $Fonts.Body $C.Dark ($S.X + 60) ($Y + 26) 260 42
      DrawPill $G $(if ($I -eq 2) { '정원마감' } else { '모집중' }) ($S.X + $S.W - 205) ($Y + 26) 135 $(if ($I -eq 2) { $C.WarnBg } else { $C.SuccessBg }) $(if ($I -eq 2) { $C.Warn } else { $C.GreenDark })
      DrawText $G $Titles[$I] $Fonts.H $C.Dark ($S.X + 60) ($Y + 72) 430 56
      DrawText $G '잠실 피클볼장 · 실력 3.0-4.0 · 3/4명' $Fonts.Small $C.Text2 ($S.X + 60) ($Y + 132) 570 34
    }
  }

  if ($Name -eq '03-detail') {
    FillRound $G ($S.X + 34) ($S.Y + 130) ($S.W - 68) 285 32 $C.Dark
    DrawPill $G '모집중' ($S.X + 60) ($S.Y + 165) 110 $C.SuccessBg $C.GreenDark
    DrawText $G '퇴근 후 더블스' $Fonts.H $C.White ($S.X + 60) ($S.Y + 220) 520 70
    DrawText $G '오늘 19:30 · 잠실 피클볼장' $Fonts.Body ([System.Drawing.Color]::FromArgb(220,255,255,255)) ($S.X + 60) ($S.Y + 300) 520 44
    $Items = @('시간|오늘 19:30','장소|잠실 피클볼장','실력|3.0 - 4.0','인원|3 / 4명')
    for ($I = 0; $I -lt 4; $I++) {
      $X = $S.X + 34 + ($I % 2) * 330
      $Y = $S.Y + 455 + [Math]::Floor($I / 2) * 150
      $Parts = $Items[$I].Split('|')
      DrawCard $G $X $Y 300 120
      DrawText $G $Parts[0] $Fonts.Small $C.Text2 ($X + 22) ($Y + 18) 220 30
      DrawText $G $Parts[1] $Fonts.Body $C.Dark ($X + 22) ($Y + 56) 250 40
    }
    DrawText $G '참가자' $Fonts.H $C.Dark ($S.X + 34) ($S.Y + 795) 300 60
    $Names = @('관리자','민준','서연')
    for ($I = 0; $I -lt 3; $I++) {
      $Y = $S.Y + 870 + $I * 112
      DrawCard $G ($S.X + 34) $Y ($S.W - 68) 88
      FillRound $G ($S.X + 58) ($Y + 21) 46 46 23 $C.Green
      DrawText $G $Names[$I] $Fonts.Body $C.Dark ($S.X + 124) ($Y + 18) 240 42
      DrawText $G "실력 3.$I" $Fonts.Small $C.Text2 ($S.X + 124) ($Y + 55) 240 30
    }
    FillRound $G ($S.X + 34) ($S.Y + $S.H - 110) ($S.W - 68) 72 24 $C.Green
    DrawCenter $G '참가하기' $Fonts.Body $C.White ($S.X + 34) ($S.Y + $S.H - 110) ($S.W - 68) 72
  }

  if ($Name -eq '04-courts') {
    DrawText $G '코트 예약' $Fonts.H $C.Dark ($S.X + 34) ($S.Y + 135) 400 70
    FillRound $G ($S.X + 34) ($S.Y + 220) ($S.W - 68) 64 22 $C.White
    DrawText $G '지역, 코트 이름 검색' $Fonts.Small $C.Muted ($S.X + 65) ($S.Y + 239) 360 32
    $Names = @('잠실 피클볼장','강남 스포츠파크','한강 실내 코트','송파 커뮤니티 코트')
    $Meta = @('송파구 · 실내 · 06-23시','강남구 · 실외 · 07-22시','마포구 · 실내 · 08-22시','송파구 · 실외 · 06-21시')
    $Price = @('시간당 20,000원','시간당 15,000원','시간당 18,000원','무료')
    for ($I = 0; $I -lt 4; $I++) {
      $Y = $S.Y + 330 + $I * 230
      DrawCard $G ($S.X + 34) $Y ($S.W - 68) 190
      FillRound $G ($S.X + 58) ($Y + 24) 120 120 28 $C.SuccessBg
      DrawText $G $Names[$I] $Fonts.Body $C.Dark ($S.X + 205) ($Y + 28) 430 42
      DrawText $G $Meta[$I] $Fonts.Small $C.Text2 ($S.X + 205) ($Y + 75) 430 34
      DrawText $G $Price[$I] $Fonts.Body $C.GreenDark ($S.X + 205) ($Y + 123) 280 40
    }
  }

  if ($Name -eq '05-tournaments') {
    DrawText $G '대회와 클럽' $Fonts.H $C.Dark ($S.X + 34) ($S.Y + 135) 450 70
    DrawText $G '참가하고, 기록하고, 함께 성장하세요' $Fonts.Small $C.Text2 ($S.X + 34) ($S.Y + 200) 560 40
    $Names = @('서울 오픈 더블스','송파 클럽 리그','루키 챌린지')
    $Dates = @('7월 20일','8월 3일','8월 18일')
    for ($I = 0; $I -lt 3; $I++) {
      $Y = $S.Y + 285 + $I * 225
      DrawCard $G ($S.X + 34) $Y ($S.W - 68) 185
      DrawText $G $Dates[$I] $Fonts.Body $C.Dark ($S.X + 60) ($Y + 28) 220 40
      DrawPill $G @('접수중','진행중','예정')[$I] ($S.X + $S.W - 190) ($Y + 28) 120 $C.SuccessBg $C.GreenDark
      DrawText $G $Names[$I] $Fonts.H $C.Dark ($S.X + 60) ($Y + 78) 450 56
      DrawText $G '장소 · 실력 · 참가 인원 한눈에 확인' $Fonts.Small $C.Text2 ($S.X + 60) ($Y + 138) 520 34
    }
    DrawText $G '추천 클럽' $Fonts.H $C.Dark ($S.X + 34) ($S.Y + 1000) 360 60
    DrawCard $G ($S.X + 34) ($S.Y + 1080) ($S.W - 68) 120
    FillRound $G ($S.X + 58) ($S.Y + 1108) 64 64 24 $C.SuccessBg
    DrawText $G '한강 피클볼 클럽' $Fonts.Body $C.Dark ($S.X + 145) ($S.Y + 1105) 360 42
    DrawText $G '멤버 128명 · 서울' $Fonts.Small $C.Text2 ($S.X + 145) ($S.Y + 1145) 300 34
  }

  if ($Name -eq '06-profile') {
    DrawText $G '내정보' $Fonts.H $C.Dark ($S.X + 34) ($S.Y + 135) 300 70
    DrawCard $G ($S.X + 34) ($S.Y + 220) ($S.W - 68) 360
    FillRound $G ($S.X + 285) ($S.Y + 260) 110 110 55 $C.Green
    DrawCenter $G 'P!' $Fonts.Logo $C.White ($S.X + 285) ($S.Y + 260) 110 110
    DrawCenter $G '관리자' $Fonts.H $C.Dark ($S.X + 34) ($S.Y + 395) ($S.W - 68) 55
    DrawCenter $G '서울 송파구 · 올라운드' $Fonts.Small $C.Text2 ($S.X + 34) ($S.Y + 450) ($S.W - 68) 34
    $Stats = @('3.5|실력','12|참여모임','인증|DUPR')
    for ($I = 0; $I -lt 3; $I++) {
      $X = $S.X + 70 + $I * 195
      $P = $Stats[$I].Split('|')
      FillRound $G $X ($S.Y + 500) 160 86 22 $C.Bg
      DrawCenter $G $P[0] $Fonts.Body $C.Dark $X ($S.Y + 510) 160 36
      DrawCenter $G $P[1] $Fonts.Small $C.Text2 $X ($S.Y + 548) 160 28
    }
    DrawCard $G ($S.X + 34) ($S.Y + 630) ($S.W - 68) 118
    DrawText $G '언어' $Fonts.Body $C.Dark ($S.X + 60) ($S.Y + 657) 220 38
    DrawText $G '한국어 / English' $Fonts.Small $C.Text2 ($S.X + 60) ($S.Y + 698) 260 30
    DrawPill $G '한국어' ($S.X + $S.W - 240) ($S.Y + 668) 100 $C.Green $C.White
    DrawPill $G 'EN' ($S.X + $S.W - 130) ($S.Y + 668) 70 $C.Bg $C.Text2
    DrawText $G '내 모임' $Fonts.H $C.Dark ($S.X + 34) ($S.Y + 820) 300 60
    $Meetups = @('오늘 19:30|퇴근 후 더블스','토요일 15:00|주말 믹스 게임')
    for ($I = 0; $I -lt 2; $I++) {
      $Y = $S.Y + 905 + $I * 175
      $P = $Meetups[$I].Split('|')
      DrawCard $G ($S.X + 34) $Y ($S.W - 68) 140
      DrawText $G $P[0] $Fonts.Small $C.GreenDark ($S.X + 60) ($Y + 22) 240 34
      DrawText $G $P[1] $Fonts.Body $C.Dark ($S.X + 60) ($Y + 62) 350 42
    }
  }

  $Path = Join-Path $OutDir ($Name + '.png')
  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $G.Dispose()
  $Bitmap.Dispose()
}

Remove-Item -LiteralPath (Join-Path $OutDir 'test.png') -ErrorAction SilentlyContinue
SaveShot '01-home' 'PLAY INSTANT' '오늘 칠 사람을 바로 찾기' '홈에서 경기, 코트, 일정을 한 번에 확인하세요.' $true
SaveShot '02-matches' 'MATCH' '가까운 번개 모임' '실력과 지역이 맞는 모임에 바로 참가하세요.' $false
SaveShot '03-detail' 'JOIN' '한 번에 참가하기' '시간, 장소, 실력, 인원을 확인하고 바로 합류하세요.' $false
SaveShot '04-courts' 'COURT' '근처 코트 예약' '운영시간과 가격을 보고 원하는 코트를 찾으세요.' $false
SaveShot '05-tournaments' 'ACHIEVE' '대회와 클럽까지' '지역 대회와 클럽으로 커뮤니티를 넓혀보세요.' $false
SaveShot '06-profile' 'PROFILE' '내 실력과 일정 관리' 'DUPR, 실력, 참여 모임을 한눈에 관리하세요.' $false

Get-ChildItem $OutDir -Filter '*.png' | Select-Object Name, Length, FullName
