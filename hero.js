(function () {
  var el = document.getElementById('hero');
  if (!el) return;
  el.innerHTML = `<svg viewBox="0 0 400 170" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Animasi pendaki menuju puncak gunung">
<g class="stars"><circle cx="30" cy="20" r="1.2"/><circle cx="90" cy="14" r="1"/><circle cx="150" cy="30" r="1.2"/><circle cx="200" cy="12" r="1"/><circle cx="310" cy="20" r="1.2"/><circle cx="360" cy="40" r="1"/><circle cx="120" cy="52" r="1"/><circle cx="285" cy="48" r="1.1"/><circle cx="380" cy="14" r="1"/></g>
<g class="rays"><line x1="75" y1="40" x2="80" y2="40"/><line x1="70.02" y1="52.02" x2="73.56" y2="55.56"/><line x1="58" y1="57" x2="58" y2="62"/><line x1="45.98" y1="52.02" x2="42.44" y2="55.56"/><line x1="41" y1="40" x2="36" y2="40"/><line x1="45.98" y1="27.98" x2="42.44" y2="24.44"/><line x1="58" y1="23" x2="58" y2="18"/><line x1="70.02" y1="27.98" x2="73.56" y2="24.44"/></g>
<circle class="sun" cx="58" cy="40" r="12"/>
<g class="cloud c1"><ellipse cx="0" cy="30" rx="20" ry="6"/><ellipse cx="13" cy="25" rx="12" ry="6"/></g>
<g class="cloud c2"><ellipse cx="0" cy="52" rx="16" ry="5"/><ellipse cx="10" cy="48" rx="10" ry="5"/></g>
<polygon class="m-far" points="0,170 0,120 40,85 70,106 110,68 150,110 190,81 230,115 270,76 320,115 360,89 400,110 400,170"/>
<polygon class="m-main" points="70,170 250,34 300,85 330,78 410,170"/>
<polygon class="snow" points="250,34 272,58 262,66 252,54 243,64 233,53 222,58"/>
<line class="flagpole" x1="250" y1="34" x2="250" y2="16"/>
<polygon class="flag" points="250,16 266,21 250,27"/>
<polygon class="m-front" points="0,170 0,140 60,115 120,145 180,128 240,157 300,140 360,153 400,136 400,170"/>
<g id="climber">
<animateMotion dur="10s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.85;1" path="M124,135 L244,45"/>
<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.92;1" dur="10s" repeatCount="indefinite"/>
<g transform="scale(1.35)">
<line class="leg a" x1="0" y1="-5" x2="0" y2="0"/>
<line class="leg b" x1="0" y1="-5" x2="0" y2="0"/>
<rect class="pack" x="-5.2" y="-12.5" width="3.6" height="6.5" rx="1.3"/>
<rect class="body" x="-2.2" y="-13" width="4.6" height="8.5" rx="1.6"/>
<circle class="body" cx="0.2" cy="-16" r="2.5"/>
<path class="pack" d="M-2.3,-16.6 A2.5,2.5 0 0 1 2.7,-16.6 Z"/>
<line class="pole" x1="3" y1="-9" x2="6.5" y2="0"/>
</g></g>
</svg>`;
})();
