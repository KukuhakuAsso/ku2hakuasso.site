const fallbackSupporters = [
  {
    name: "匿名支持者",
    displayName: "匿名支持者",
    amount: 30,
    note: "感谢支持解谜研究与更新",
    link: "https://afdian.net/a/ku2hakuasso",
  },
  {
    name: "夜航者",
    displayName: "夜航者",
    amount: 50,
    note: "希望更多线索能继续被发现",
    link: "https://afdian.net/a/ku2hakuasso",
  },
  {
    name: "箱中旅客",
    displayName: "箱中旅客",
    amount: 20,
    note: "愿空白之地永远有新的谜题",
    link: "https://afdian.net/a/ku2hakuasso",
  },
];

const normalizeSupporters = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data?.list)) {
    return payload.data.list;
  }

  if (Array.isArray(payload?.list)) {
    return payload.list;
  }

  return [];
};

const formatAmount = (amount) => {
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) {
    return "赞助支持";
  }
  return `¥${numeric}`;
};

const formatName = (supporter) => {
  return supporter?.displayName || supporter?.name || "匿名支持者";
};

const formatNote = (supporter) => {
  return supporter?.note || "感谢你对空白解谜组的支持";
};

const formatAvatarText = (supporter) => {
  const name = formatName(supporter);
  return name.charAt(0) || "爱";
};

const fetchSupporters = async (apiUrl = "/api/supporters?limit=8") => {
  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`网络请求失败：${response.status}`);
  }

  const payload = await response.json();
  const normalized = normalizeSupporters(payload);

  return normalized.map((supporter) => ({
    ...supporter,
    displayName: formatName(supporter),
    note: formatNote(supporter),
    amount: Number(supporter.amount ?? 0),
    link: supporter.link || "https://afdian.net/a/ku2hakuasso",
  }));
};

export {
  fallbackSupporters,
  fetchSupporters,
  formatAmount,
  formatAvatarText,
  formatName,
  formatNote,
  normalizeSupporters,
};
