/* ことば(日本語・英語・韓国語)
   - 言語は、サイトのホームページで選んだもの(localStorage の muddys-lang)。なければ日本語。ゲームの中に切りかえボタンはない
   - 日本語の文をそのまま「かぎ」にする: t('やられた…') → 英語なら 'Wasted…'。辞書にない文は日本語のまま出る
   - {n} のような所は、t('体力 {n}', { n: 80 }) で数字や名前に入れかわる
   - index.html の data-t がついた所は、中の日本語(innerHTML)をかぎにして入れかえる。data-tp は placeholder
   - 店や看板の漢字(漢方薬・武器・福満楼など)は街の見た目なので、訳さない */
(function () {
  let L = 'ja';
  try { L = localStorage.getItem('muddys-lang') || 'ja'; } catch (e) { /* 読めなくても日本語で遊べる */ }
  if (L !== 'en' && L !== 'ko') L = 'ja';

  // 日本語: [英語, 韓国語]
  const D = {
    /* ---------- 画面(index.html) ---------- */
    'やめる': ['Quit', '그만두기'],
    'ダッシュ': ['Dash', '대시'],
    '回復': ['Heal', '회복'],
    'こうげき': ['Attack', '공격'],
    'バック': ['Reverse', '후진'],
    'ブレーキ': ['Brake', '브레이크'],
    'アクセル': ['Gas', '액셀'],
    'チャイナタウンで生き延びろ': ['Survive in Chinatown', '차이나타운에서 살아남아라'],
    '📱 このゲームは<b>横向き</b>で遊びます': ['📱 This game is played in <b>landscape</b>', '📱 이 게임은 <b>가로 화면</b>으로 플레이합니다'],
    'みんなで配達競争(オンライン)': ['Delivery Race with Friends (Online)', '다 함께 배달 경쟁(온라인)'],
    'ひとりで遊ぶ(ミッション)': ['Play Solo (Missions)', '혼자 하기(미션)'],
    '操作': ['Controls', '조작'],
    '左下のスティック：歩く／車のハンドル(左右)<br>それ以外の場所をドラッグ：カメラを回す<br>「乗る／降りる」：車の乗り降り<br>「ダッシュ」：走る<br>「こうげき」：銃はボタンを倒してねらい、離して撃つ<br>車では「アクセル」「ブレーキ」「バック」のボタンで走る<br>パソコン：WASD・矢印キー、E で乗り降り、Shift でダッシュ、Space でブレーキ': [
      'Stick (bottom left): walk / steer the car (left and right)<br>Drag anywhere else: turn the camera<br>"Get in / Get out": get in and out of cars<br>"Dash": run<br>"Attack": with a gun, drag the button to aim and release to shoot<br>In a car, drive with the "Gas", "Brake" and "Reverse" buttons<br>PC: WASD or arrow keys, E to get in/out, Shift to dash, Space to brake',
      '왼쪽 아래 스틱: 걷기 / 자동차 핸들(좌우)<br>그 밖의 곳을 드래그: 카메라 돌리기<br>"타기 / 내리기": 차 타고 내리기<br>"대시": 달리기<br>"공격": 총은 버튼을 끌어서 조준하고, 떼면 쏜다<br>차에서는 "액셀" "브레이크" "후진" 버튼으로 달린다<br>PC: WASD·방향키, E로 타고 내리기, Shift로 대시, Space로 브레이크'],
    'ひとりで遊ぶ': ['Play Solo', '혼자 하기'],
    '5つの配達ミッションに挑戦。人をはねたり、車にぶつけたりすると手配度(★)が上がって警察が追ってくる。警察官につかまると逮捕！<br>光るマークの店で、武器(赤)や薬(緑)が買える。': [
      'Take on 5 delivery missions. Hit people or crash into cars and your wanted level (★) goes up and the police come after you. Get caught by an officer and you\'re busted!<br>At shops with a glowing marker you can buy weapons (red) and medicine (green).',
      '5개의 배달 미션에 도전. 사람을 치거나 차에 부딪히면 수배도(★)가 올라가고 경찰이 쫓아온다. 경찰관에게 잡히면 체포!<br>빛나는 표시가 있는 가게에서 무기(빨강)와 약(초록)을 살 수 있다.'],
    '配達競争(2〜4人)': ['Delivery Race (2–4 players)', '배달 경쟁(2~4명)'],
    '荷物を先に取って、届け先まで運ぶと1点。荷物を持っている人にぶつかると奪える。先に3点取った人の勝ち！': [
      'Grab the package first and take it to the drop-off for 1 point. Bump into whoever has the package to steal it. First to 3 points wins!',
      '짐을 먼저 가져가서 배달지까지 옮기면 1점. 짐을 가진 사람에게 부딪히면 빼앗을 수 있다. 먼저 3점을 딴 사람이 승리!'],
    'Muddy\'s Games トップ': ['Muddy\'s Games Home', 'Muddy\'s Games 홈'],
    'プライバシーポリシー': ['Privacy Policy', '개인정보 처리방침'],
    '配達競争': ['Delivery Race', '배달 경쟁'],
    'あなたの名前': ['Your name', '이름'],
    'ルームを作る': ['Create a room', '방 만들기'],
    'または、ルームコードで参加': ['Or join with a room code', '또는 방 코드로 참가'],
    '4桁': ['4 digits', '4자리'],
    '参加': ['Join', '참가'],
    'もどる': ['Back', '뒤로'],
    'ルームコード(友だちに教えてね)': ['Room code (share it with your friends)', '방 코드(친구에게 알려 주세요)'],
    '参加者': ['Players', '참가자'],
    'スタート': ['Start', '시작'],
    'ロビーにもどす': ['Back to the lobby', '로비로 돌아가기'],
    '退出': ['Leave', '나가기'],
    '終了': ['Finished', '종료'],
    'もう一度': ['Play again', '한 번 더'],
    'ホストが次を決めるのを待っています': ['Waiting for the host to decide what\'s next', '호스트가 다음을 정하기를 기다리는 중'],
    '街を見る': ['Look around the city', '거리 보기'],
    '店': ['Shop', '가게'],
    '出る': ['Leave', '나가기'],
    '⚠ 画面が縦になっています': ['⚠ Your screen is in portrait mode', '⚠ 화면이 세로로 되어 있어요'],
    'スマホを横にしてね': ['Please turn your phone sideways', '휴대폰을 가로로 돌려 주세요'],

    /* ---------- ゲーム(main.js) ---------- */
    'エラー: ': ['Error: ', '오류: '],
    '3Dの道具(Three.js)を読みこめませんでした。ページを開き直してね': ['Could not load the 3D engine (Three.js). Please reload the page.', '3D 도구(Three.js)를 불러오지 못했어요. 페이지를 다시 열어 주세요.'],
    '武器屋': ['Gun Shop', '무기점'],
    '薬屋': ['Pharmacy', '약국'],
    '漢方薬局': ['Herbal Pharmacy', '한방 약국'],
    '武': ['W', '무'], // ミニマップの武器屋のしるし
    '薬': ['M', '약'], // ミニマップの薬屋のしるし
    '素手': ['Fists', '맨손'],
    '刀': ['Blade', '칼'],
    '日本刀': ['Katana', '일본도'],
    'ピストル': ['Pistol', '권총'],
    'パトカーを奪った！': ['Stole a police car!', '경찰차를 빼앗았다!'],
    'マシンガン': ['Machine Gun', '기관총'],
    '{w}をひろった！': ['Picked up {w}!', '{w} 획득!'],
    ' (弾+{n})': [' (+{n} ammo)', ' (탄약 +{n})'],
    'やられた…': ['Wasted…', '당했다…'],
    '病院で目がさめた… -${fine}　武器を没収された': ['Woke up at the hospital… -${fine}  Weapons confiscated', '병원에서 깨어났다… -${fine}  무기를 압수당했다'],
    '　ミッション失敗': ['  Mission failed', '  미션 실패'],
    '車から引きずり出された！': ['Dragged out of the car!', '차에서 끌려 나왔다!'],
    '弾がない！': ['Out of ammo!', '탄약이 없다!'],
    '体力は満タン': ['Health is already full', '체력이 가득 찼다'],
    '回復した！ (のこり {n})': ['Healed! ({n} left)', '회복했다! (남은 개수 {n})'],
    '車に乗ろう': ['Get a Car', '차에 타자'],
    '近くの赤い車に近づいて「乗る」(Eキー)で乗ろう': ['Walk up to the red car nearby and tap "Get in" (E key)', '근처의 빨간 차에 다가가서 "타기"(E 키)로 타자'],
    'はじめての配達': ['First Delivery', '첫 배달'],
    '荷物を受け取りに行こう(黄色い光)': ['Go pick up the package (yellow light)', '짐을 받으러 가자(노란 빛)'],
    '荷物ゲット！': ['Got the package!', '짐 획득!'],
    '荷物を届けよう': ['Deliver the package', '짐을 배달하자'],
    '急ぎの配達': ['Rush Delivery', '급한 배달'],
    '急ぎの荷物を受け取ろう': ['Pick up the rush package', '급한 짐을 받자'],
    '50秒以内に届けろ！': ['Deliver it within 50 seconds!', '50초 안에 배달해!'],
    'あやしい荷物': ['Shady Package', '수상한 짐'],
    'あやしい荷物を受け取れ': ['Pick up the shady package', '수상한 짐을 받아라'],
    '警察をかわして港の船へ運べ！': ['Dodge the police and take it to the boat at the harbor!', '경찰을 따돌리고 항구의 배로 옮겨라!'],
    '最後の大仕事': ['The Last Big Job', '마지막 큰 일'],
    'チェックポイント 1/4': ['Checkpoint 1/4', '체크포인트 1/4'],
    'チェックポイント 2/4': ['Checkpoint 2/4', '체크포인트 2/4'],
    'チェックポイント 3/4': ['Checkpoint 3/4', '체크포인트 3/4'],
    'チェックポイント 4/4': ['Checkpoint 4/4', '체크포인트 4/4'],
    '港の船へ急げ！': ['Hurry to the boat at the harbor!', '항구의 배로 서둘러!'],
    '警察に追われている！': ['The police are after you!', '경찰에게 쫓기고 있다!'],
    'ミッション{n}：{title}': ['Mission {n}: {title}', '미션 {n}: {title}'],
    'ミッション完了！ +${r}': ['Mission complete! +${r}', '미션 완료! +${r}'],
    '次のミッションへ…': ['On to the next mission…', '다음 미션으로…'],
    'チェックポイント通過！': ['Checkpoint passed!', '체크포인트 통과!'],
    'もう一度挑戦…': ['Trying again…', '다시 도전…'],
    'ゲームクリア！': ['Game Clear!', '게임 클리어!'],
    '街いちばんの配達屋になった！': ['You became the best courier in town!', '거리 최고의 배달부가 되었다!'],
    '所持金：': ['Money: ', '소지금: '],
    'プレイ時間：': ['Play time: ', '플레이 시간: '],
    '{m}分{s}秒': ['{m} min {s} sec', '{m}분 {s}초'],
    'このあと街は自由に走り回れます。': ['You can now roam the city freely.', '이제 거리를 자유롭게 돌아다닐 수 있어요.'],
    'もう一度遊ぶ': ['Play again', '다시 하기'],
    '街を自由に走る': ['Free roam', '자유롭게 달리기'],
    '逮捕された！ -$1000　武器を没収　ミッション失敗': ['Busted! -$1000  Weapons confiscated  Mission failed', '체포됐다! -$1000  무기 압수  미션 실패'],
    '逮捕された！ -$1000　武器を没収': ['Busted! -$1000  Weapons confiscated', '체포됐다! -$1000  무기 압수'],
    '車を奪った！': ['Car stolen!', '차를 빼앗았다!'],
    '乗る': ['Get in', '타기'],
    '降りる': ['Get out', '내리기'],
    '手配度ダウン': ['Wanted level down', '수배도 하락'],
    '逃げ切った！': ['You got away!', '따돌렸다!'],
    '逃げろ！ 捕まるぞ！': ['Run! You\'re about to be caught!', '도망쳐! 잡힌다!'],
    '時間切れ… ミッション失敗': ['Time\'s up… Mission failed', '시간 초과… 미션 실패'],
    'フリー走行': ['Free Roam', '자유 주행'],
    '街を自由に走り回ろう': ['Roam the city freely', '거리를 자유롭게 달려 보자'],
    'ミッション{n}': ['Mission {n}', '미션 {n}'],
    'ミッション{n}/{total}：{title}': ['Mission {n}/{total}: {title}', '미션 {n}/{total}: {title}'],
    'あと {d} m': ['{d} m to go', '앞으로 {d} m'],
    '体力 {n}': ['HP {n}', '체력 {n}'],
    '回復 ×{n}': ['Heal ×{n}', '회복 ×{n}'],
    '残り {n} 秒': ['{n} sec left', '남은 시간 {n}초'],
    '配達競争：{n}点先取': ['Delivery Race: first to {n}', '배달 경쟁: {n}점 선취'],
    '準備中…': ['Getting ready…', '준비 중…'],
    'おわり！': ['Finished!', '끝!'],
    '荷物(黄色い光)を取りに行け！': ['Go get the package (yellow light)!', '짐(노란 빛)을 가지러 가!'],
    '届け先(緑の光)へ急げ！': ['Hurry to the drop-off (green light)!', '배달지(초록 빛)로 서둘러!'],
    'ぶつかられると取られるぞ': ['If someone bumps you, they take it', '부딪히면 빼앗긴다'],
    '・あと {d} m': [' · {d} m to go', ' · 앞으로 {d} m'],
    '{name} から荷物を奪え！': ['Steal the package from {name}!', '{name}에게서 짐을 빼앗아라!'],
    '赤い光の人にぶつかろう': ['Bump into the player with the red light', '빨간 빛의 사람에게 부딪혀 보자'],
    '{n}点': ['{n} pts', '{n}점'],
    'ピストル(弾12発つき)': ['Pistol (with 12 rounds)', '권총(탄약 12발 포함)'],
    'ピストルの弾 12発': ['Pistol ammo ×12', '권총 탄약 12발'],
    '持っている': ['Already owned', '이미 가지고 있음'],
    'ピストルがない': ['You need a pistol', '권총이 없음'],
    'マシンガン(弾50発つき)': ['Machine Gun (with 50 rounds)', '기관총(탄약 50발 포함)'],
    'マシンガンの弾 50発': ['Machine gun ammo ×50', '기관총 탄약 50발'],
    'マシンガンがない': ['You need a machine gun', '기관총이 없음'],
    'マシンガンの弾 {n}': ['MG ammo {n}', '기관총 탄약 {n}'],
    'その場で全回復': ['Full heal now', '즉시 완전 회복'],
    '回復薬(体力+{hp}。{max}つまで持てる)': ['Medkit (+{hp} HP, carry up to {max})', '회복약(체력 +{hp}, 최대 {max}개)'],
    'もう{max}つ持っている': ['Already carrying {max}', '이미 {max}개 가지고 있음'],
    '防弾チョッキ({n})': ['Bulletproof vest ({n})', '방탄조끼({n})'],
    'もう着ている': ['Already wearing one', '이미 입고 있음'],
    'お金がたりない': ['Not enough money', '돈이 부족함'],
    '所持金 ${m}': ['Money ${m}', '소지금 ${m}'],
    'チョッキ {n}': ['Vest {n}', '조끼 {n}'],
    '回復薬 {n}': ['Medkits {n}', '회복약 {n}'],
    '弾 {n}': ['Ammo {n}', '탄약 {n}'],
    '配達競争スタート！': ['The delivery race begins!', '배달 경쟁 시작!'],
    'あなた': ['You', '나'],
    '{who}が配達成功！ {n}点': ['{who} delivered! {n} pts', '{who} 배달 성공! {n}점'],
    '荷物を奪った！': ['You stole the package!', '짐을 빼앗았다!'],
    '荷物ゲット！ 届け先へ急げ': ['Got the package! Hurry to the drop-off', '짐 획득! 배달지로 서둘러'],
    '{name}に荷物を奪われた！': ['{name} stole your package!', '{name}에게 짐을 빼앗겼다!'],
    '{name}が荷物を奪った': ['{name} stole the package', '{name} 님이 짐을 빼앗았다'],
    '{name}が荷物を取った': ['{name} grabbed the package', '{name} 님이 짐을 가져갔다'],

    /* ---------- ロビー・配達競争(lobby.js・online.js) ---------- */
    'ネットにつながりませんでした。電波を確認して、ページを開き直してね': ['Could not connect. Check your signal and reload the page.', '인터넷에 연결하지 못했어요. 신호를 확인하고 페이지를 다시 열어 주세요.'],
    '接続中…': ['Connecting…', '연결 중…'],
    '名前を入れてね': ['Please enter your name', '이름을 입력해 주세요'],
    '接続中です。少し待ってね': ['Connecting. Please wait a moment.', '연결 중이에요. 잠시 기다려 주세요.'],
    'うまくいきませんでした。もう一度ためしてね': ['Something went wrong. Please try again.', '잘 되지 않았어요. 다시 시도해 주세요.'],
    'ルームを作っています…': ['Creating a room…', '방을 만드는 중…'],
    'ルームを作れませんでした。もう一度ためしてね': ['Could not create a room. Please try again.', '방을 만들지 못했어요. 다시 시도해 주세요.'],
    'ルームコードは数字4桁だよ': ['The room code is 4 digits', '방 코드는 숫자 4자리예요'],
    'さがしています…': ['Searching…', '찾는 중…'],
    'そのルームはありません': ['That room doesn\'t exist', '그 방은 없어요'],
    'もう始まっています。終わるまで待ってね': ['The game has already started. Please wait until it ends.', '이미 시작했어요. 끝날 때까지 기다려 주세요.'],
    '満員です(最大{n}人)': ['The room is full (max {n})', '정원이 찼어요(최대 {n}명)'],
    'ルームがなくなりました': ['The room is gone', '방이 없어졌어요'],
    'ルームから外れました': ['You were removed from the room', '방에서 나가게 되었어요'],
    'ホスト': ['Host', '호스트'],
    '切断中': ['Disconnected', '연결 끊김'],
    '{a} / {b}人': ['{a} / {b}', '{a} / {b}명'],
    '試合中です。終わるまで待ってね': ['A game is in progress. Please wait until it ends.', '경기 중이에요. 끝날 때까지 기다려 주세요.'],
    '{n}人以上そろったらスタートできます': ['You can start when {n} or more players are here', '{n}명 이상 모이면 시작할 수 있어요'],
    'みんなそろったらスタートを押してね': ['Press Start when everyone is here', '모두 모이면 시작을 눌러 주세요'],
    'ホストがスタートするのを待っています': ['Waiting for the host to start', '호스트가 시작하기를 기다리는 중'],
    'あなたの勝ち！': ['You win!', '승리!'],
    '{name} の勝ち！': ['{name} wins!', '{name} 님의 승리!'],
    '{n}点先取の配達競争': ['Delivery race, first to {n}', '{n}점 선취 배달 경쟁'],
  };

  const idx = L === 'en' ? 0 : 1;
  function t(k, v) {
    let s = k;
    if (L !== 'ja' && D[k]) s = D[k][idx];
    if (v) s = s.replace(/\{(\w+)\}/g, (m, n) => (n in v ? v[n] : m));
    return s;
  }
  window.LANG = L; window.t = t; window.T_DICT = D;

  // 画面の文字を入れかえる
  function applyDom() {
    if (!document.querySelectorAll) return;
    document.documentElement.lang = L;
    if (L === 'ja') return;
    document.querySelectorAll('[data-t]').forEach(el => { el.innerHTML = t(el.innerHTML.trim()); });
    document.querySelectorAll('[data-tp]').forEach(el => { el.placeholder = t(el.placeholder); });
    document.querySelectorAll('a[data-home]').forEach(el => { el.href = 'https://muddys-games.com/' + L + '/'; });
  }
  applyDom();
})();
