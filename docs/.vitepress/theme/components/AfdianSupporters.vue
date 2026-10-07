<script setup>
import { computed, onMounted, ref } from "vue";
import { getSupporters } from "../api/supportersApi.js";

const props = defineProps({
  afdianUrl: {
    type: String,
    default: "https://afdian.com/a/mistargspringcele",
  },
  pageSize: {
    type: Number,
    default: 20,
  },
});

const records = ref([]);
const totalCents = ref(0);
const currentPage = ref(1);
const totalPages = ref(1);
const isLoading = ref(true);
const toastVisible = ref(false);

const moneyFormat = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const formatTime = (value) => {
  const parts = Object.fromEntries(
    timeFormat.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

const formatMoney = (amountCents) => {
  const numeric = Number(amountCents ?? 0) / 100;
  return `¥ ${moneyFormat.format(numeric)}`;
};

const pageNumbers = computed(() =>
  Array.from({ length: totalPages.value }, (_, index) => index + 1),
);

const visibleRecords = computed(() => {
  const start = (currentPage.value - 1) * props.pageSize;
  const end = start + props.pageSize;
  return records.value.slice(start, end);
});

const totalAmountText = computed(() =>
  moneyFormat.format(totalCents.value / 100),
);

const rangeStart = computed(() => {
  if (!records.value.length) {
    return 0;
  }
  return (currentPage.value - 1) * props.pageSize + 1;
});

const rangeEnd = computed(() => {
  if (!records.value.length) {
    return 0;
  }
  return Math.min(currentPage.value * props.pageSize, records.value.length);
});

const onSupportLinkClick = (event) => {
  if (props.afdianUrl) {
    return;
  }

  event.preventDefault();
  toastVisible.value = true;
  window.setTimeout(() => {
    toastVisible.value = false;
  }, 4000);
};

const loadSupporters = async () => {
  isLoading.value = true;

  try {
    const response = await getSupporters({
      page: currentPage.value,
      pageSize: props.pageSize,
    });

    records.value = response.records || [];
    totalCents.value = Number(response.totalCents || 0);
    totalPages.value = Math.max(1, Number(response.totalPages || 1));
  } catch (error) {
    console.warn("爱发电记录加载失败", error);
  } finally {
    isLoading.value = false;
  }
};

const goToPage = (page) => {
  if (!Number.isInteger(page) || page < 1 || page > totalPages.value) {
    return;
  }

  if (page === currentPage.value) {
    return;
  }

  currentPage.value = page;
  loadSupporters();
};

onMounted(() => {
  loadSupporters();
});
</script>

<template>
  <section class="support-showcase">
    <header class="page-header">
      <h1>爱发电支持</h1>
      <a
        class="support-link"
        :href="props.afdianUrl || '#'"
        target="_blank"
        rel="noopener noreferrer"
        @click="onSupportLinkClick"
      >
        前往爱发电支持 <span class="arrow" aria-hidden="true">↗</span>
      </a>
    </header>

    <section class="summary" aria-labelledby="support-summary-title">
      <h2 id="support-summary-title">累计支持金额</h2>
      <p class="total" aria-label="累计支持金额">
        <span class="currency" aria-hidden="true">¥</span>
        <span>{{ totalAmountText }}</span>
      </p>
      <p class="thanks">
        感谢各位支持，你们的为爱发电将支持我们创作出更好的作品。
      </p>
    </section>

    <section class="records" aria-labelledby="support-records-title">
      <div class="records-header">
        <h2 id="support-records-title">支持记录</h2>
        <span class="records-count">共 {{ records.length }} 笔支持</span>
      </div>

      <div class="records-table" role="table" aria-label="支持记录表格">
        <div class="records-row records-head" role="row">
          <div class="records-cell records-cell--head" role="columnheader">支持者 ID</div>
          <div class="records-cell records-cell--head" role="columnheader">单笔金额</div>
          <div class="records-cell records-cell--head" role="columnheader">支持时间（北京时间）</div>
        </div>

        <div v-if="isLoading" class="records-row records-empty" role="row">
          <div class="records-cell empty-message" role="cell">加载中...</div>
        </div>

        <template v-else-if="visibleRecords.length > 0">
          <div v-for="record in visibleRecords" :key="`${record.id}-${record.supportedAt}`" class="records-row" role="row">
            <div class="records-cell record-id" role="cell">{{ record.id }}</div>
            <div class="records-cell record-amount" role="cell">{{ formatMoney(record.amountCents) }}</div>
            <div class="records-cell record-time" role="cell">
              <time :datetime="record.supportedAt">{{ formatTime(record.supportedAt) }}</time>
            </div>
          </div>
        </template>

        <div v-else class="records-row records-empty" role="row">
          <div class="records-cell empty-message" role="cell">暂无支持记录</div>
        </div>
      </div>

      <div class="pagination">
        <p class="range" role="status" aria-live="polite" aria-atomic="true">
          第 {{ rangeStart }}–{{ rangeEnd }} 条，共 {{ records.length }} 条
        </p>

        <nav class="page-navigation" aria-label="支持记录分页">
          <button class="page-button" type="button" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">
            上一页
          </button>

          <div class="page-numbers">
            <button
              v-for="page in pageNumbers"
              :key="page"
              class="page-button"
              type="button"
              :aria-current="page === currentPage ? 'page' : null"
              @click="goToPage(page)"
            >
              {{ page }}
            </button>
          </div>

          <button
            class="page-button"
            type="button"
            :disabled="currentPage === totalPages"
            @click="goToPage(currentPage + 1)"
          >
            下一页
          </button>
        </nav>
      </div>
    </section>

    <div class="toast" v-if="toastVisible" aria-live="polite">
      <span class="toast-message">爱发电链接待配置</span>
      <button class="toast-close" type="button" aria-label="关闭提示" @click="toastVisible = false">×</button>
    </div>
  </section>
</template>

<style scoped>
.support-showcase {
  width: min(960px, calc(100% - 48px));
  margin: 0 auto;
  padding: 40px 0;
  color: var(--vp-c-text-1);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  line-height: 1.6;
}

.page-header {
  text-align: center;
  margin-bottom: 28px;
}

.demo-badge {
  display: inline-block;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 2px 9px;
  background: var(--vp-c-bg-soft);
  font-size: 12px;
  color: var(--vp-c-text-2);
  letter-spacing: 0.06em;
}

.page-header h1 {
  margin: 12px 0 18px;
  font-size: 36px;
  line-height: 1.3;
  font-weight: 650;
  letter-spacing: 0.03em;
}

.support-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 44px;
  padding: 9px 22px;
  border: 1px solid var(--vp-c-text-1);
  border-radius: 6px;
  background: var(--vp-c-text-1);
  color: var(--vp-c-bg);
  text-decoration: none;
  font-weight: 500;
  transition: opacity 0.15s ease;
}

.support-link:hover {
  opacity: 0.9;
}

.arrow {
  font-size: 17px;
  line-height: 1;
}

.summary {
  padding: 24px 32px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  text-align: center;
  margin-bottom: 24px;
}

.summary h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.total {
  margin: 4px 0 16px;
  line-height: 1.25;
  font-size: clamp(36px, 5vw, 48px);
  font-weight: 650;
  letter-spacing: -0.025em;
  font-variant-numeric: tabular-nums;
}

.currency {
  font-size: 0.58em;
  margin-right: 7px;
  font-weight: 500;
  vertical-align: 0.12em;
}

.thanks {
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  overflow-wrap: anywhere;
}

.records {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.records-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 24px;
}

.records-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.records-count {
  color: var(--vp-c-text-2);
  font-size: 13px;
  white-space: nowrap;
}

.records-table {
  display: grid;
  width: 100%;
}

.records-row {
  display: grid;
  grid-template-columns: 45% 22% 33%;
  align-items: stretch;
  border-bottom: 1px solid var(--vp-c-divider);
}

.records-head {
  border-top: 1px solid var(--vp-c-divider);
  border-bottom: 1px solid var(--vp-c-divider);
  background: rgba(0, 0, 0, 0.02);
}

.records-cell {
  min-width: 0;
  padding: 13px 24px;
  color: var(--vp-c-text-1);
  display: flex;
  align-items: center;
}

.records-cell--head {
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 500;
  padding: 10px 24px;
}

.records-row:last-child {
  border-bottom: 0;
}

.record-id {
  overflow-wrap: anywhere;
  word-break: break-word;
  font-weight: 500;
}

.record-amount {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.record-time {
  color: var(--vp-c-text-2);
  font-size: 13px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.records-empty .records-cell {
  text-align: center;
  color: var(--vp-c-text-2);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  padding: 16px 24px;
  border-top: 1px solid var(--vp-c-divider);
}

.range {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.page-navigation,
.page-numbers {
  display: flex;
  align-items: center;
  gap: 6px;
}

.page-button {
  min-width: 36px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  cursor: pointer;
}

.page-button:hover:not(:disabled):not([aria-current="page"]) {
  background: var(--vp-c-bg-soft);
  border-color: var(--vp-c-text-2);
}

.page-button[aria-current="page"] {
  border-color: var(--vp-c-text-1);
  background: var(--vp-c-text-1);
  color: var(--vp-c-bg);
}

.page-button:disabled {
  color: var(--vp-c-text-3);
  background: rgba(0, 0, 0, 0.02);
  cursor: default;
}

.empty-message {
  text-align: center;
  color: var(--vp-c-text-2);
}

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 20px;
  max-width: calc(100% - 32px);
  padding: 12px 14px 12px 18px;
  border-radius: 6px;
  background: var(--vp-c-text-1);
  color: var(--vp-c-bg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.toast-message {
  white-space: nowrap;
}

.toast-close {
  border: 0;
  padding: 0;
  width: 26px;
  height: 26px;
  color: var(--vp-c-bg);
  background: transparent;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

@media (max-width: 768px) {
  .support-showcase {
    width: calc(100% - 32px);
    padding: 28px 0;
  }

  .page-header {
    margin-bottom: 22px;
  }

  .page-header h1 {
    font-size: 29px;
    margin: 12px 0 18px;
  }

  .summary {
    padding: 22px 18px;
    margin-bottom: 20px;
  }

  .thanks {
    font-size: 13px;
    line-height: 1.8;
  }

  .records-header {
    padding: 16px;
  }

  .records-header h2 {
    font-size: 16px;
  }

  .records-table {
    display: block;
  }

  .records-head {
    display: none;
  }

  .records-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 12px;
    row-gap: 6px;
    margin: 0 16px;
    padding: 14px 0;
    border-top: 1px solid var(--vp-c-divider);
  }

  .records-cell {
    display: block;
    min-width: 0;
    padding: 0;
    border: 0;
  }

  .record-id {
    font-size: 13px;
  }

  .record-amount {
    text-align: right;
    font-size: 13px;
  }

  .records-row .record-time {
    grid-column: 1 / -1;
    font-size: 12px;
  }

  .record-time::before {
    content: "支持时间　";
    color: #929292;
  }

  .pagination {
    justify-content: center;
    padding: 16px;
    gap: 12px;
  }

  .range {
    width: 100%;
    text-align: center;
  }

  .page-button {
    min-width: 32px;
    height: 36px;
    padding: 0 10px;
    font-size: 12px;
  }
}
</style>
