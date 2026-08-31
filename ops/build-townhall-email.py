# -*- coding: utf-8 -*-
"""Fills the Junior Wolves email template with the Town Hall content.
   Placeholders {{TOKEN}} and {{BASE}} stay in the output — Apps Script
   substitutes them per recipient at send time."""
import sys, io, os

T = open(os.path.join(os.path.dirname(__file__), 'jw-email-template.html'), encoding='utf-8').read()

SUBJECT = "Junior Wolves Town Hall + Meet the Coaches — Wednesday 6:30 PM"
PREHEADER = ("Wednesday, September 2 at 6:30 PM, in person or virtual. Meet the coaching staff "
             "and hear what's ahead for Junior Wolves.")

def row(label, value):
    return (
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>'
      '<td style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:1.6px;'
      'color:#a1a1aa;text-transform:uppercase;font-weight:bold;padding-bottom:3px;">' + label + '</td></tr><tr>'
      '<td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:21px;color:#ffffff;">'
      + value + '</td></tr></table>')

# ---- Location + virtual link: NOT INVENTED. Filled from site-data at send time. ----
DETAIL = row("Where — in person", "{{VENUE}}") + row("Where — online", "{{VIRTUAL}}")

BODY = """
<p style="margin:0 0 16px 0;">Junior Wolves is being rebuilt as a true developmental feeder program for
Niles West basketball. This is the night we walk families through exactly what that means.</p>

<p style="margin:0 0 16px 0;">Whether your son has already signed up or you're hearing about Junior Wolves
for the first time, you're welcome at this meeting.</p>

<p style="margin:0 0 10px 0;font-weight:bold;color:#ffffff;">What we'll cover</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">
  <tr><td valign="top" style="font-family:Arial,Helvetica,sans-serif;color:#c8102e;font-size:16px;line-height:24px;padding-right:10px;">&#9642;</td>
      <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#e4e4e7;">Meet the Junior Wolves coaching staff</td></tr>
  <tr><td valign="top" style="color:#c8102e;font-size:16px;line-height:24px;padding-right:10px;">&#9642;</td>
      <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#e4e4e7;">The Wolf Way &mdash; the standard we hold players to</td></tr>
  <tr><td valign="top" style="color:#c8102e;font-size:16px;line-height:24px;padding-right:10px;">&#9642;</td>
      <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#e4e4e7;">How the feeder program will actually operate</td></tr>
  <tr><td valign="top" style="color:#c8102e;font-size:16px;line-height:24px;padding-right:10px;">&#9642;</td>
      <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#e4e4e7;">Fall Open Skills Clinics &mdash; Sept 27, Oct 11, Oct 25</td></tr>
  <tr><td valign="top" style="color:#c8102e;font-size:16px;line-height:24px;padding-right:10px;">&#9642;</td>
      <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#e4e4e7;">The tryout process and how players are evaluated</td></tr>
  <tr><td valign="top" style="color:#c8102e;font-size:16px;line-height:24px;padding-right:10px;">&#9642;</td>
      <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#e4e4e7;">The pathway toward Niles West basketball</td></tr>
  <tr><td valign="top" style="color:#c8102e;font-size:16px;line-height:24px;padding-right:10px;">&#9642;</td>
      <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#e4e4e7;">Your questions &mdash; we'll leave real time for them</td></tr>
</table>

<p style="margin:0;">Come in person or join online, whichever works for your family.</p>
"""

def button(label, sublabel, href, bg, border, color):
    return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="jw-btn" style="margin-bottom:10px;">'
    '<tr><td align="center" bgcolor="' + bg + '" style="background:' + bg + ';border:2px solid ' + border + ';">'
    '<a href="' + href + '" target="_blank" style="display:block;padding:16px 18px;'
    'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:bold;letter-spacing:1.4px;'
    'text-transform:uppercase;color:' + color + ';text-decoration:none;">' + label +
    ('<span style="display:block;font-size:10px;letter-spacing:1px;font-weight:normal;color:' + color + ';opacity:0.75;padding-top:4px;">' + sublabel + '</span>' if sublabel else '')
    + '</a></td></tr></table>')

ACTION = ('<tr><td class="jw-pad" style="padding:28px 36px 0 36px;">'
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
  '<td height="1" bgcolor="#2a2a2f" style="height:1px;line-height:1px;font-size:1px;background:#2a2a2f;">&nbsp;</td>'
  '</tr></table></td></tr>'
  '<tr><td class="jw-pad" align="left" style="padding:24px 36px 0 36px;'
  'font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:14px;letter-spacing:2.4px;'
  'color:#ff3b52;font-weight:bold;text-transform:uppercase;">Please RSVP</td></tr>'
  '<tr><td class="jw-pad" align="left" style="padding:8px 36px 16px 36px;'
  'font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#e4e4e7;">'
  'One tap &mdash; it helps us plan the room and the food. You can change your answer later if plans shift.'
  '</td></tr>'
  '<tr><td class="jw-pad" style="padding:0 36px 0 36px;">'
  + button("Attending in person", "", "{{BASE}}?r={{TOKEN}}&amp;a=in", "#c8102e", "#c8102e", "#ffffff")
  + button("Attending virtually", "", "{{BASE}}?r={{TOKEN}}&amp;a=vr", "#0b0b0c", "#ffffff", "#ffffff")
  + button("Can't make it", "", "{{BASE}}?r={{TOKEN}}&amp;a=no", "#0b0b0c", "#3a3a40", "#a1a1aa")
  + '</td></tr>')

SECONDARY = ('<tr><td class="jw-pad" style="padding:26px 36px 0 36px;">'
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#17171a" style="background:#17171a;">'
  '<tr><td style="padding:20px 22px;border-left:3px solid #c8102e;">'
  '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:2px;'
  'color:#a1a1aa;text-transform:uppercase;font-weight:bold;">Community Partner</div>'
  '<div class="jw-display" style="font-family:\'Arial Black\',\'Arial Bold\',Arial,Helvetica,sans-serif;'
  'font-size:20px;line-height:24px;color:#ffffff;text-transform:uppercase;padding-top:8px;">Village Inn</div>'
  '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#e4e4e7;padding-top:10px;">'
  'We&rsquo;re grateful to Village Inn &mdash; a Skokie institution &mdash; for supporting the Junior Wolves '
  'Town Hall and providing pizza for families joining us in person. Please RSVP so we can give them an '
  'accurate head count.</div>'
  '</td></tr></table></td></tr>')

FOOTER_NOTE = ("You're receiving this because you registered interest in Junior Wolves or previously shared "
               "your email with the Niles West feeder program. Reply to this email if you'd rather not "
               "receive Junior Wolves updates.")

html = (T.replace("{{SUBJECT}}", SUBJECT)
         .replace("{{PREHEADER}}", PREHEADER)
         .replace("{{ISSUE_LABEL}}", "Town Hall")
         .replace("{{HEADLINE}}", "Town Hall<br>+ Meet the Coaches")
         .replace("{{EVENT_DATE}}", "Wednesday, September 2")
         .replace("{{EVENT_TIME}}", "6:30 PM")
         .replace("{{EVENT_FORMAT}}", "In person + virtual")
         .replace("{{EVENT_DETAIL_ROWS}}", DETAIL)
         .replace("{{BODY}}", BODY)
         .replace("{{ACTION_BLOCK}}", ACTION)
         .replace("{{SECONDARY_BLOCK}}", SECONDARY)
         .replace("{{FOOTER_NOTE}}", FOOTER_NOTE))

open(os.path.join(os.path.dirname(__file__),'townhall-email.html'),'w',encoding='utf-8').write(html)
print("SUBJECT:", SUBJECT)
print("PREHEADER:", PREHEADER)
print("bytes:", len(html))
print("unresolved placeholders:", sorted(set(__import__('re').findall(r'\{\{[A-Z_]+\}\}', html))))
