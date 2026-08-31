"use client";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Clock, Search, Shuffle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { flagIconCode } from "@/lib/emoji-flags";
import { emojiMatches } from "@/lib/emoji-search";

// ── Emoji categories (Notion-standard 8 categories) ──────────────────────────
// Extracted out of IconPicker so the same searchable, categorized emoji grid
// (search + recent + skin tone + category shortcut bar) can be reused
// anywhere an emoji needs picking — page icons and comment reactions alike.

type EmojiCategory = {
  id: string;
  label: string;
  icon: string;
  emojis: string[];
};

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "people",
    label: "Smileys & People",
    icon: "😀",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "🤣",
      "😂",
      "🙂",
      "🙃",
      "😉",
      "😊",
      "😇",
      "🥰",
      "😍",
      "🤩",
      "😘",
      "😗",
      "😚",
      "😙",
      "🥲",
      "😋",
      "😛",
      "😜",
      "🤪",
      "😝",
      "🤑",
      "🤗",
      "🤭",
      "🤫",
      "🤔",
      "🤐",
      "🤨",
      "😐",
      "😑",
      "😶",
      "😏",
      "😒",
      "🙄",
      "😬",
      "🤥",
      "😌",
      "😔",
      "😪",
      "🤤",
      "😴",
      "😷",
      "🤒",
      "🤕",
      "🤢",
      "🤮",
      "🤧",
      "🥵",
      "🥶",
      "🥴",
      "😵",
      "🤯",
      "🤠",
      "🥸",
      "😎",
      "🤓",
      "🧐",
      "😕",
      "😟",
      "🙁",
      "☹️",
      "😮",
      "😯",
      "😲",
      "😳",
      "🥺",
      "😦",
      "😧",
      "😨",
      "😰",
      "😥",
      "😢",
      "😭",
      "😱",
      "😖",
      "😣",
      "😞",
      "😓",
      "😩",
      "😫",
      "🥱",
      "😤",
      "😡",
      "😠",
      "🤬",
      "😈",
      "👿",
      "💀",
      "☠️",
      "💩",
      "🤡",
      "👹",
      "👺",
      "👻",
      "👽",
      "👾",
      "🤖",
      "😺",
      "😸",
      "😹",
      "👋",
      "🤚",
      "🖐️",
      "✋",
      "🖖",
      "👌",
      "🤌",
      "🤏",
      "✌️",
      "🤞",
      "🤟",
      "🤘",
      "🤙",
      "👈",
      "👉",
      "👆",
      "🖕",
      "👇",
      "☝️",
      "👍",
      "👎",
      "✊",
      "👊",
      "🤛",
      "🤜",
      "👏",
      "🙌",
      "👐",
      "🤲",
      "🤝",
      "🙏",
      "💅",
      "🤳",
      "💪",
      "🦵",
      "🦶",
      "👂",
      "🦻",
      "👃",
      "🦷",
      "🦴",
      "👀",
      "👁️",
      "👅",
      "💋",
      "💌",
      "💘",
      "💝",
      "💖",
      "💗",
      "💓",
      "💞",
      "💕",
      "❣️",
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "💔",
      "❤️‍🔥",
      "❤️‍🩹",
      "💯",
      "💢",
      "💥",
      "💫",
      "💦",
      "💨",
      "🕳️",
      "💬",
    ],
  },
  {
    id: "animals",
    label: "Animals & Nature",
    icon: "🐶",
    emojis: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐻‍❄️",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐸",
      "🐵",
      "🙈",
      "🙉",
      "🙊",
      "🐔",
      "🐧",
      "🐦",
      "🐤",
      "🦆",
      "🦅",
      "🦉",
      "🦇",
      "🐺",
      "🐗",
      "🐴",
      "🦄",
      "🐝",
      "🐛",
      "🦋",
      "🐌",
      "🐞",
      "🐜",
      "🦟",
      "🦗",
      "🕷️",
      "🦂",
      "🐢",
      "🐍",
      "🦎",
      "🦖",
      "🦕",
      "🐙",
      "🦑",
      "🦐",
      "🦞",
      "🦀",
      "🐡",
      "🐠",
      "🐟",
      "🐬",
      "🐳",
      "🐋",
      "🦈",
      "🐊",
      "🐅",
      "🐆",
      "🦓",
      "🦍",
      "🦧",
      "🦣",
      "🐘",
      "🦛",
      "🦏",
      "🐪",
      "🐫",
      "🦒",
      "🦘",
      "🦬",
      "🐃",
      "🐂",
      "🌵",
      "🎄",
      "🌲",
      "🌳",
      "🌴",
      "🪵",
      "🌱",
      "🌿",
      "☘️",
      "🍀",
      "🎍",
      "🪴",
      "🎋",
      "🍃",
      "🍂",
      "🍁",
      "🍄",
      "🌾",
      "💐",
      "🌷",
      "🌹",
      "🥀",
      "🌺",
      "🌸",
      "🌼",
      "🌻",
      "🌞",
      "🌝",
      "🌛",
      "🌜",
      "🌚",
      "🌕",
      "🌖",
      "🌗",
      "🌘",
      "🌑",
      "🌒",
      "🌓",
      "🌔",
      "🌙",
      "🌟",
      "⭐",
      "🌠",
      "🌌",
      "☀️",
      "🌤️",
      "⛅",
      "🌥️",
      "☁️",
      "🌦️",
      "🌧️",
      "⛈️",
      "🌩️",
      "🌨️",
      "❄️",
      "☃️",
      "⛄",
      "🌬️",
      "💨",
      "🌪️",
    ],
  },
  {
    id: "food",
    label: "Food & Drink",
    icon: "🍕",
    emojis: [
      "🍎",
      "🍐",
      "🍊",
      "🍋",
      "🍌",
      "🍉",
      "🍇",
      "🍓",
      "🫐",
      "🍈",
      "🍒",
      "🍑",
      "🥭",
      "🍍",
      "🥥",
      "🥝",
      "🍅",
      "🫒",
      "🍆",
      "🥑",
      "🥦",
      "🥬",
      "🥒",
      "🌶️",
      "🫑",
      "🧄",
      "🧅",
      "🥔",
      "🍠",
      "🥐",
      "🥯",
      "🍞",
      "🥖",
      "🫓",
      "🧀",
      "🥚",
      "🍳",
      "🧈",
      "🥞",
      "🧇",
      "🥓",
      "🥩",
      "🍗",
      "🍖",
      "🦴",
      "🌭",
      "🍔",
      "🍟",
      "🍕",
      "🫔",
      "🌮",
      "🌯",
      "🥙",
      "🧆",
      "🥚",
      "🍿",
      "🧂",
      "🥫",
      "🍱",
      "🍘",
      "🍙",
      "🍚",
      "🍛",
      "🍜",
      "🍝",
      "🍠",
      "🍢",
      "🍣",
      "🍤",
      "🍥",
      "🥮",
      "🍡",
      "🥟",
      "🥠",
      "🥡",
      "🦀",
      "🦞",
      "🦐",
      "🦑",
      "🦪",
      "🍦",
      "🍧",
      "🍨",
      "🍩",
      "🍪",
      "🎂",
      "🍰",
      "🧁",
      "🥧",
      "🍫",
      "🍬",
      "🍭",
      "🍮",
      "🍯",
      "🍼",
      "🥛",
      "☕",
      "🫖",
      "🍵",
      "🧃",
      "🥤",
      "🧋",
      "🍶",
      "🍺",
      "🍻",
      "🥂",
      "🍷",
      "🥃",
      "🍸",
      "🍹",
      "🧉",
      "🍾",
      "🧊",
      "🥄",
      "🍴",
      "🍽️",
      "🥢",
      "🫙",
      "🧂",
      "🫕",
    ],
  },
  {
    id: "activity",
    label: "Activity",
    icon: "⚽",
    emojis: [
      "⚽",
      "🏀",
      "🏈",
      "⚾",
      "🥎",
      "🎾",
      "🏐",
      "🏉",
      "🥏",
      "🎱",
      "🪀",
      "🏓",
      "🏸",
      "🏒",
      "🥍",
      "🏑",
      "🪃",
      "🥅",
      "⛳",
      "🪁",
      "🎣",
      "🤿",
      "🎽",
      "🎿",
      "🛷",
      "🥌",
      "🎯",
      "🪃",
      "🎱",
      "🎮",
      "🕹️",
      "🎲",
      "🧩",
      "🧸",
      "🪅",
      "🎭",
      "🎨",
      "🖼️",
      "🎪",
      "🤹",
      "🎠",
      "🎡",
      "🎢",
      "🎟️",
      "🎫",
      "🏆",
      "🥇",
      "🥈",
      "🥉",
      "🏅",
      "🎖️",
      "🏵️",
      "🎗️",
      "🎀",
      "🎁",
      "🎊",
      "🎉",
      "🎋",
      "🎍",
      "🎎",
      "🎏",
      "🎐",
      "🧧",
      "🎆",
      "🎇",
      "🧨",
      "🎴",
      "🀄",
      "🃏",
      "🎰",
      "🎳",
      "🎻",
      "🎸",
      "🎹",
      "🥁",
      "🎷",
      "🎺",
      "🪗",
      "🎙️",
      "🎚️",
      "🎛️",
      "📻",
      "🎤",
      "🎧",
      "📢",
      "📣",
      "🔔",
      "🔕",
      "🎵",
      "🎶",
    ],
  },
  {
    id: "travel",
    label: "Travel & Places",
    icon: "✈️",
    emojis: [
      "🚗",
      "🚕",
      "🚙",
      "🚌",
      "🚎",
      "🏎️",
      "🚓",
      "🚑",
      "🚒",
      "🚐",
      "🛻",
      "🚚",
      "🚛",
      "🚜",
      "🏍️",
      "🛵",
      "🚲",
      "🛴",
      "🛺",
      "🚨",
      "🚔",
      "🚍",
      "🚘",
      "🚖",
      "🚡",
      "🚠",
      "🚟",
      "🚃",
      "🚋",
      "🚞",
      "🚝",
      "🚄",
      "🚅",
      "🚈",
      "🚂",
      "🚆",
      "🚇",
      "🚊",
      "🚉",
      "✈️",
      "🛫",
      "🛬",
      "🛩️",
      "💺",
      "🛰️",
      "🚀",
      "🛸",
      "🚁",
      "🛶",
      "⛵",
      "🚤",
      "🛥️",
      "🛳️",
      "⛴️",
      "🚢",
      "🗺️",
      "🧭",
      "🏔️",
      "⛰️",
      "🌋",
      "🗻",
      "🏕️",
      "🏖️",
      "🏜️",
      "🏝️",
      "🏞️",
      "🏟️",
      "🏛️",
      "🏗️",
      "🧱",
      "🏘️",
      "🏚️",
      "🏠",
      "🏡",
      "🏢",
      "🏣",
      "🏤",
      "🏥",
      "🏦",
      "🏨",
      "🏩",
      "🏪",
      "🏫",
      "🏬",
      "🏭",
      "🏯",
      "🏰",
      "💒",
      "🗼",
      "🗽",
      "⛪",
      "🕌",
      "🛕",
      "🕍",
      "⛩️",
      "🕋",
      "⛲",
      "⛺",
      "🌁",
      "🌃",
      "🏙️",
      "🌄",
      "🌅",
      "🌆",
      "🌇",
      "🌉",
      "🌌",
      "🌠",
      "🎇",
      "🎆",
      "🎑",
      "🗾",
      "🏔️",
      "🌐",
      "🗺️",
      "🧳",
      "☂️",
      "⛱️",
      "🎡",
      "🎢",
    ],
  },
  {
    id: "objects",
    label: "Objects",
    icon: "💡",
    emojis: [
      "💡",
      "🔦",
      "🕯️",
      "🪔",
      "💰",
      "💴",
      "💵",
      "💶",
      "💷",
      "💸",
      "💳",
      "🪙",
      "💹",
      "📈",
      "📉",
      "📊",
      "📋",
      "📌",
      "📍",
      "📎",
      "🖇️",
      "📏",
      "📐",
      "✂️",
      "🗃️",
      "🗄️",
      "🗑️",
      "🔒",
      "🔓",
      "🔏",
      "🔐",
      "🔑",
      "🗝️",
      "🔨",
      "🪓",
      "⛏️",
      "⚒️",
      "🛠️",
      "🗡️",
      "⚔️",
      "🛡️",
      "🪚",
      "🔧",
      "🪛",
      "🔩",
      "⚙️",
      "🗜️",
      "🔗",
      "⛓️",
      "🪝",
      "🧲",
      "🪜",
      "⚖️",
      "🦯",
      "🔭",
      "🔬",
      "🩺",
      "💊",
      "🩹",
      "🩻",
      "🧬",
      "🦠",
      "🧪",
      "🧫",
      "🧲",
      "🪄",
      "🔮",
      "🧿",
      "🪬",
      "🧸",
      "🪆",
      "🪅",
      "🎭",
      "🎨",
      "🖼️",
      "📷",
      "📸",
      "📹",
      "🎥",
      "📽️",
      "🎞️",
      "📞",
      "☎️",
      "📟",
      "📠",
      "📺",
      "📻",
      "🧭",
      "⏱️",
      "⏰",
      "🕰️",
      "📡",
      "🔋",
      "🔌",
      "💻",
      "🖥️",
      "🖨️",
      "⌨️",
      "🖱️",
      "💾",
      "💿",
      "📀",
      "📱",
      "📲",
      "☎️",
      "📔",
      "📒",
      "📓",
      "📕",
      "📗",
      "📘",
      "📙",
      "📚",
      "📖",
      "🔖",
      "🏷️",
      "📝",
      "✏️",
      "✒️",
      "🖊️",
      "🖋️",
      "🖌️",
      "📮",
      "📯",
      "📦",
      "📫",
      "📪",
      "📬",
      "📭",
      "📮",
      "🗳️",
      "🗂️",
      "📁",
      "📂",
      "🗃️",
    ],
  },
  {
    id: "symbols",
    label: "Symbols",
    icon: "❤️",
    emojis: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "❤️‍🔥",
      "❤️‍🩹",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💝",
      "💘",
      "💟",
      "☮️",
      "✝️",
      "☪️",
      "🕉️",
      "☸️",
      "🔯",
      "🪯",
      "✡️",
      "☦️",
      "🛐",
      "⛎",
      "♈",
      "♉",
      "♊",
      "♋",
      "♌",
      "♍",
      "♎",
      "♏",
      "♐",
      "♑",
      "♒",
      "♓",
      "🆔",
      "⚛️",
      "🈴",
      "🈳",
      "🈺",
      "🈵",
      "🈹",
      "🈲",
      "🅰️",
      "🅱️",
      "🆎",
      "🆑",
      "🅾️",
      "🆘",
      "❌",
      "⭕",
      "🛑",
      "⛔",
      "📛",
      "🚫",
      "💯",
      "💢",
      "♨️",
      "🚷",
      "🚯",
      "🚳",
      "🚱",
      "🔞",
      "📵",
      "🔕",
      "🔇",
      "🔈",
      "🔉",
      "🔊",
      "📯",
      "🔔",
      "🔕",
      "🎵",
      "🎶",
      "⚠️",
      "🚸",
      "🔱",
      "⚜️",
      "🔰",
      "♻️",
      "✅",
      "🈶",
      "🈚",
      "🈸",
      "🈺",
      "🈷️",
      "✴️",
      "🆚",
      "💮",
      "🉐",
      "㊙️",
      "㊗️",
      "🈴",
      "🈵",
      "🈹",
      "🈲",
      "⁉️",
      "🔟",
      "💹",
      "❇️",
      "✳️",
      "❎",
      "🌐",
      "💠",
      "Ⓜ️",
      "🌀",
      "💤",
      "🏧",
      "🚾",
      "♿",
      "🅿️",
      "🛗",
      "🈳",
      "🚰",
      "🚹",
      "🚺",
      "🚻",
      "🚼",
      "🚽",
      "🚿",
      "🛁",
      "🛒",
      "🔃",
      "🔄",
      "🔙",
      "🔚",
      "🔛",
      "🔜",
      "🔝",
      "⏫",
      "⬆️",
      "↗️",
      "➡️",
      "↘️",
      "⬇️",
      "↙️",
      "⬅️",
      "↖️",
      "↕️",
      "↔️",
      "↩️",
      "1️⃣",
      "2️⃣",
      "3️⃣",
      "4️⃣",
      "5️⃣",
      "6️⃣",
      "7️⃣",
      "8️⃣",
      "9️⃣",
      "0️⃣",
      "#️⃣",
      "*️⃣",
      "▶️",
      "⏸️",
      "⏹️",
    ],
  },
  {
    id: "flags",
    label: "Flags",
    icon: "🏳️",
    emojis: [
      "🏳️",
      "🏴",
      "🏁",
      "🚩",
      "🏳️‍🌈",
      "🏳️‍⚧️",
      "🏴‍☠️",
      "🇺🇳",
      "🇦🇫",
      "🇦🇱",
      "🇩🇿",
      "🇦🇩",
      "🇦🇴",
      "🇦🇬",
      "🇦🇷",
      "🇦🇲",
      "🇦🇺",
      "🇦🇹",
      "🇦🇿",
      "🇧🇸",
      "🇧🇭",
      "🇧🇩",
      "🇧🇧",
      "🇧🇾",
      "🇧🇪",
      "🇧🇿",
      "🇧🇯",
      "🇧🇹",
      "🇧🇴",
      "🇧🇦",
      "🇧🇼",
      "🇧🇷",
      "🇧🇳",
      "🇧🇬",
      "🇧🇫",
      "🇧🇮",
      "🇨🇻",
      "🇰🇭",
      "🇨🇲",
      "🇨🇦",
      "🇨🇫",
      "🇹🇩",
      "🇨🇱",
      "🇨🇳",
      "🇨🇴",
      "🇰🇲",
      "🇨🇬",
      "🇨🇩",
      "🇨🇷",
      "🇨🇮",
      "🇭🇷",
      "🇨🇺",
      "🇨🇾",
      "🇨🇿",
      "🇩🇰",
      "🇩🇯",
      "🇩🇲",
      "🇩🇴",
      "🇪🇨",
      "🇪🇬",
      "🇸🇻",
      "🇬🇶",
      "🇪🇷",
      "🇪🇪",
      "🇸🇿",
      "🇪🇹",
      "🇫🇯",
      "🇫🇮",
      "🇫🇷",
      "🇬🇦",
      "🇬🇲",
      "🇬🇪",
      "🇩🇪",
      "🇬🇭",
      "🇬🇷",
      "🇬🇩",
      "🇬🇹",
      "🇬🇳",
      "🇬🇼",
      "🇬🇾",
      "🇭🇹",
      "🇭🇳",
      "🇭🇺",
      "🇮🇸",
      "🇮🇳",
      "🇮🇩",
      "🇮🇷",
      "🇮🇶",
      "🇮🇪",
      "🇮🇱",
      "🇮🇹",
      "🇯🇲",
      "🇯🇵",
      "🇯🇴",
      "🇰🇿",
      "🇰🇪",
      "🇰🇮",
      "🇽🇰",
      "🇰🇼",
      "🇰🇬",
      "🇱🇦",
      "🇱🇻",
      "🇱🇧",
      "🇱🇸",
      "🇱🇷",
      "🇱🇾",
      "🇱🇮",
      "🇱🇹",
      "🇱🇺",
      "🇲🇬",
      "🇲🇼",
      "🇲🇾",
      "🇲🇻",
      "🇲🇱",
      "🇲🇹",
      "🇲🇭",
      "🇲🇷",
      "🇲🇺",
      "🇲🇽",
      "🇫🇲",
      "🇲🇩",
      "🇲🇨",
      "🇲🇳",
      "🇲🇪",
      "🇲🇦",
      "🇲🇿",
      "🇲🇲",
      "🇳🇦",
      "🇳🇷",
      "🇳🇵",
      "🇳🇱",
      "🇳🇿",
      "🇳🇮",
      "🇳🇪",
      "🇳🇬",
      "🇳🇴",
      "🇴🇲",
      "🇵🇰",
      "🇵🇼",
      "🇵🇸",
      "🇵🇦",
      "🇵🇬",
      "🇵🇾",
      "🇵🇪",
      "🇵🇭",
      "🇵🇱",
      "🇵🇹",
      "🇶🇦",
      "🇷🇴",
      "🇷🇺",
      "🇷🇼",
      "🇰🇳",
      "🇱🇨",
      "🇻🇨",
      "🇼🇸",
      "🇸🇲",
      "🇸🇹",
      "🇸🇦",
      "🇸🇳",
      "🇷🇸",
      "🇸🇨",
      "🇸🇱",
      "🇸🇬",
      "🇸🇰",
      "🇸🇮",
      "🇸🇧",
      "🇸🇴",
      "🇿🇦",
      "🇸🇸",
      "🇪🇸",
      "🇱🇰",
      "🇸🇩",
      "🇸🇷",
      "🇸🇪",
      "🇨🇭",
      "🇸🇾",
      "🇹🇼",
      "🇹🇯",
      "🇹🇿",
      "🇹🇭",
      "🇹🇱",
      "🇹🇬",
      "🇹🇴",
      "🇹🇹",
      "🇹🇳",
      "🇹🇷",
      "🇹🇲",
      "🇺🇬",
      "🇺🇦",
      "🇦🇪",
      "🇬🇧",
      "🇺🇸",
      "🇺🇾",
      "🇺🇿",
      "🇻🇺",
      "🇻🇪",
      "🇻🇳",
      "🇾🇪",
      "🇿🇲",
      "🇿🇼",
      "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
      "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
      "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    ],
  },
];

// Country/region flags render via the flag-icons SVG set (see lib/emoji-flags)
// because Windows' system emoji font shows raw letter pairs instead of flags.

const RECENT_KEY = "wf_recent_emojis";
const SKIN_TONE_KEY = "wf_skin_tone";
const MAX_RECENT = 20;

const SKIN_TONES = [
  { tone: "", hand: "✋" },
  { tone: "\u{1F3FB}", hand: "✋🏻" },
  { tone: "\u{1F3FC}", hand: "✋🏼" },
  { tone: "\u{1F3FD}", hand: "✋🏽" },
  { tone: "\u{1F3FE}", hand: "✋🏾" },
  { tone: "\u{1F3FF}", hand: "✋🏿" },
] as const;

// Emojis in People category that accept skin-tone modifiers
const SKIN_TONE_CAPABLE = new Set([
  "👋",
  "🤚",
  "🖐️",
  "✋",
  "🖖",
  "👌",
  "🤌",
  "🤏",
  "✌️",
  "🤞",
  "🤟",
  "🤘",
  "🤙",
  "👈",
  "👉",
  "👆",
  "🖕",
  "👇",
  "☝️",
  "👍",
  "👎",
  "✊",
  "👊",
  "🤛",
  "🤜",
  "👏",
  "🙌",
  "👐",
  "🤲",
  "🙏",
  "💅",
  "🤳",
  "💪",
  "🦵",
  "🦶",
  "👂",
  "🦻",
  "👃",
  "🫵",
  "🫴",
  "🫳",
  "🫲",
  "🫱",
  "🫶",
  "🫰",
]);

// Module level rather than defined inside the picker: as a nested definition it
// was a brand-new component type on every render, remounting every button in
// the grid. Behaviour is unchanged — the click still calls the picker's own
// handler, now passed in as a prop.
function EmojiBtn({
  emoji,
  onSelect,
}: {
  emoji: string;
  onSelect: (emoji: string) => void;
}) {
  const flagCode = flagIconCode(emoji);
  return (
    <button
      aria-label={emoji}
      className="flex size-7.5 select-none items-center justify-center rounded-xs text-[19px] leading-none transition-colors hover:bg-base-200"
      draggable={false}
      onClick={() => onSelect(emoji)}
      onDragStart={(e) => e.preventDefault()}
      type="button"
    >
      {flagCode ? (
        <span className={`fi fi-${flagCode} fis rounded-[2px]`} />
      ) : (
        emoji
      )}
    </button>
  );
}

function stripTone(emoji: string): string {
  // Remove Fitzpatrick skin-tone modifier (U+1F3FB – U+1F3FF) so we always store the base emoji
  return emoji.replace(/[\u{1F3FB}-\u{1F3FF}]/u, "");
}

function applyTone(emoji: string, tone: string): string {
  const base = stripTone(emoji);
  if (!tone || !SKIN_TONE_CAPABLE.has(base)) {
    return base;
  }
  // Strip variation selector (U+FE0F) so the skin tone modifier combines correctly.
  // e.g. 🖐️(U+1F590+FE0F) + 🏽 must be stored as U+1F590+1F3FD, not U+1F590+FE0F+1F3FD,
  // otherwise browsers render them as two separate glyphs.
  return base.replace(/️/g, "") + tone;
}

function getSavedTone(): string {
  try {
    return localStorage.getItem(SKIN_TONE_KEY) ?? "";
  } catch {
    return "";
  }
}
function saveTone(tone: string) {
  try {
    localStorage.setItem(SKIN_TONE_KEY, tone);
  } catch {
    /* noop */
  }
}

function getRecent(): string[] {
  try {
    const raw = JSON.parse(
      localStorage.getItem(RECENT_KEY) ?? "[]"
    ) as string[];
    // Migrate: strip any stored tone modifiers so recent list only contains base emojis
    return [...new Set(raw.map(stripTone).filter(Boolean))];
  } catch {
    return [];
  }
}
function addRecent(emoji: string) {
  try {
    const base = stripTone(emoji);
    if (!base) {
      return;
    }
    const list = [base, ...getRecent().filter((e) => e !== base)].slice(
      0,
      MAX_RECENT
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

export function randomEmoji(): string {
  const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
  return all[Math.floor(Math.random() * all.length)] ?? "📝";
}

export interface EmojiGridPickerProps {
  /** Called after a normal grid-cell selection — the caller owns closing the popover. */
  onClose: () => void;
  /** Called with the final (tone-applied) emoji when a grid cell is clicked. */
  onSelect: (emoji: string) => void;
  /** When provided, shows a "Shuffle" button that calls this with a random
   *  emoji instead of onSelect — lets the caller preview without closing
   *  (e.g. IconPicker keeps the picker open so you can re-roll). */
  onShuffle?: (emoji: string) => void;
}

// Deliberately has no outer border/width/positioning — callers own their own
// popover chrome, so this stays a plain content block that fits either container.
export function EmojiGridPicker({
  onSelect,
  onClose,
  onShuffle,
}: EmojiGridPickerProps) {
  const [emojiSearch, setEmojiSearch] = useState("");
  const [skinTone, setSkinTone] = useState<string>(() => getSavedTone());
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const emojiScrollRef = useRef<HTMLDivElement>(null);
  const catRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  const currentHand = SKIN_TONES.find((s) => s.tone === skinTone)?.hand ?? "✋";

  useEffect(() => {
    setRecentEmojis(getRecent());
  }, []);

  const emojiSearchResults = emojiSearch.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e) =>
        emojiMatches(e, emojiSearch)
      )
    : null;

  function scrollToCategory(id: string) {
    const el = catRefs.current[id];
    if (el && emojiScrollRef.current) {
      emojiScrollRef.current.scrollTop = el.offsetTop - 4;
    }
  }

  function handleEmojiSelect(emoji: string) {
    const base = stripTone(emoji);
    const final = applyTone(base, skinTone);
    addRecent(base); // always store the base emoji — tone is applied dynamically on display/select
    setRecentEmojis(getRecent());
    onSelect(final);
    onClose();
  }

  function handleSkinTone(tone: string) {
    setSkinTone(tone);
    saveTone(tone);
  }

  return (
    <div className="flex flex-col">
      {/* Search row */}
      <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-2.5">
        <div className="relative flex-1">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/50"
            size={12}
          />
          <input
            autoFocus
            className="w-full rounded-sm border border-base-300 bg-base-200 py-1.5 pl-7 pr-2.5 text-sm text-base-content outline-none placeholder:text-base-content/50 focus:border-primary/50"
            onChange={(e) => setEmojiSearch(e.target.value)}
            placeholder="Filter..."
            value={emojiSearch}
          />
        </div>
        {onShuffle && (
          <button
            className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-base-300 bg-base-200 text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
            onClick={() => {
              const picked = randomEmoji();
              onShuffle(applyTone(stripTone(picked), skinTone));
            }}
            onMouseEnter={(e) => showTooltip("Random", e)}
            onMouseLeave={hideTooltip}
            type="button"
          >
            <Shuffle size={13} />
          </button>
        )}
        {/* Skin tone — a Popover nested inside EmojiGridPicker's own outer
            chrome (icon-picker.tsx's Popover, or callers' own hand-rolled
            outside-click systems, e.g. comment-card.tsx / cell-comment-popover.tsx).
            Headless UI wraps every Popover's subtree in a shared "main tree"
            context (see @headlessui/react's useRootContainers/useNestedPortals);
            a nested Popover's portaled panel registers itself into that
            context, so an ancestor Popover's own outside-click correctly
            treats clicks inside this one as "inside," not outside — no
            data-*-exempt marker needed for that case. `onMouseDown`
            stopPropagation is kept anyway as defense-in-depth for
            cell-comment-popover.tsx's hand-rolled (non-Headless-UI) outside-click
            listeners, which only check DOM containment against their own refs. */}
        <Popover>
          <PopoverButton
            className="flex size-8 shrink-0 select-none items-center justify-center rounded-sm border border-base-300 bg-base-200 text-[18px] leading-none outline-none transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-open:border-primary/50 data-open:bg-base-200"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onMouseEnter={(e) => showTooltip("Select skin tone", e)}
            onMouseLeave={hideTooltip}
          >
            {currentHand}
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: "bottom end", gap: 6 }}
            className="z-9999 flex items-center gap-0.5 rounded-md border border-base-300 bg-neutral p-1.5 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
            onMouseDown={(e) => e.stopPropagation()}
            transition
          >
            {({ close }) => (
              <>
                {SKIN_TONES.map((s) => (
                  <button
                    className={`flex size-8 select-none items-center justify-center rounded-sm text-[18px] leading-none outline-none transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${skinTone === s.tone ? "bg-base-200 ring-1 ring-primary/40" : ""}`}
                    draggable={false}
                    key={s.tone}
                    onClick={() => {
                      handleSkinTone(s.tone);
                      close();
                    }}
                    onDragStart={(e) => e.preventDefault()}
                    onMouseEnter={(e) =>
                      showTooltip(s.tone ? "Skin tone" : "Default", e)
                    }
                    onMouseLeave={hideTooltip}
                    type="button"
                  >
                    {s.hand}
                  </button>
                ))}
              </>
            )}
          </PopoverPanel>
        </Popover>
      </div>

      {/* Emoji scroll area */}
      <div className="h-58 overflow-y-auto px-2.5" ref={emojiScrollRef}>
        {emojiSearchResults ? (
          emojiSearchResults.length === 0 ? (
            <p className="py-8 text-center text-xs text-base-content/70">
              No emojis found
            </p>
          ) : (
            <div className="grid grid-cols-10 gap-0 pb-2 pt-1">
              {emojiSearchResults.map((emoji, i) => (
                <EmojiBtn
                  emoji={emoji}
                  // biome-ignore lint/suspicious/noArrayIndexKey: the glyph already carries the identity here; the index is only a tiebreak because the emojilib dataset can surface the same glyph twice in one result set. EmojiBtn is stateless, so a positional remount is inert.
                  key={`s-${emoji}-${i}`}
                  onSelect={handleEmojiSelect}
                />
              ))}
            </div>
          )
        ) : (
          <>
            {recentEmojis.length > 0 && (
              <div
                ref={(el) => {
                  catRefs.current.recent = el;
                }}
              >
                <p className="sticky top-0 z-10 bg-base-100 pb-0.5 pt-1 text-[11px] font-medium text-base-content/50">
                  Recently used
                </p>
                <div className="grid grid-cols-10 gap-0 pb-1">
                  {recentEmojis.map((emoji, i) => (
                    <EmojiBtn
                      emoji={emoji}
                      // biome-ignore lint/suspicious/noArrayIndexKey: the glyph already carries the identity here; the index is only a tiebreak because the emojilib dataset can surface the same glyph twice in one list. EmojiBtn is stateless, so a positional remount is inert.
                      key={`r-${emoji}-${i}`}
                      onSelect={handleEmojiSelect}
                    />
                  ))}
                </div>
              </div>
            )}
            {EMOJI_CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                ref={(el) => {
                  catRefs.current[cat.id] = el;
                }}
              >
                <p className="sticky top-0 z-10 bg-base-100 pb-0.5 pt-1 text-[11px] font-medium text-base-content/50">
                  {cat.label}
                </p>
                <div className="grid grid-cols-10 gap-0 pb-1">
                  {cat.emojis.map((emoji, i) => (
                    <EmojiBtn
                      emoji={emoji}
                      // biome-ignore lint/suspicious/noArrayIndexKey: category + glyph already carry the identity; the index is only a tiebreak because the emojilib dataset can list the same glyph twice within a category. EmojiBtn is stateless, so a positional remount is inert.
                      key={`${cat.id}-${emoji}-${i}`}
                      onSelect={handleEmojiSelect}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Category shortcut bar */}
      <div className="flex items-center justify-around border-t border-base-300 px-1 py-1 scrollbar-none">
        <button
          className="flex size-7 shrink-0 items-center justify-center rounded-sm text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
          onClick={() => scrollToCategory("recent")}
          onMouseEnter={(e) => showTooltip("Recently used", e)}
          onMouseLeave={hideTooltip}
          type="button"
        >
          <Clock size={13} />
        </button>
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            className="flex size-7 shrink-0 select-none items-center justify-center rounded-sm text-[15px] leading-none transition-colors hover:bg-base-200"
            draggable={false}
            key={cat.id}
            onClick={() => scrollToCategory(cat.id)}
            onDragStart={(e) => e.preventDefault()}
            onMouseEnter={(e) => showTooltip(cat.label, e)}
            onMouseLeave={hideTooltip}
            type="button"
          >
            {cat.icon}
          </button>
        ))}
      </div>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </div>
  );
}
