<template>
  <div class="container">
    <div class="config-item">
      <span class="label">输出目录：</span>
      <el-input v-model="outputDir" class="value"></el-input>
    </div>
    <div class="config-item">
      <span class="label">CSRF Token：</span>
      <el-input v-model="csrfToken" class="value"></el-input>
    </div>
    <div class="config-item" style="align-items: flex-start;">
      <span class="label">Cookies：</span>
      <el-input type="textarea" :rows="8" v-model="cookieString" class="value"></el-input>
    </div>
    <el-button type="primary" @click="updateConfig">提交</el-button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { sendRequest } from '@/utils/request.js';

const outputDir = ref('');
const cookieString = ref('');
const csrfToken = ref('');
const updateConfig = async () => {
  const res = await sendRequest('/api/config/saveConfig', { outputDir: outputDir.value }, 'POST');
  await sendRequest('/api/login/updateLoginInfo', {}, 'POST', {
    cookies: cookieString.value,
    csrfToken: csrfToken.value
  });
  ElMessage.success(res.message);
};
onMounted(async () => {
  const res = await sendRequest('/api/config/getConfig')
  outputDir.value = res.output_dir;
  const loginRes = await sendRequest('/api/login/getLoginInfo')
  cookieString.value = loginRes.cookies;
  csrfToken.value = loginRes.csrfToken;
})
</script>

<style scoped>
.container {
  text-align: center;
  padding: 20px;
  overflow: auto;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-end;
  gap: 10px;
}

.config-item {
  width: 100%;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
}

.config-item .label {
  width: 120px;
  text-align: right;
}

.config-item .value {
  flex: 1;
}
</style>