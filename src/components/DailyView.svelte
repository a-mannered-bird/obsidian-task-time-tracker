<script lang="ts">
  // Get the current file's content
  const todayPage = {
    file: {
      name: "2025-04-01" // TODO: Get Title of the current file
    }
  }
  // Getting yesterday's data
  const y = new Date(todayPage.file.name) // First date
  y.setDate(y.getDate() - 1);
  const year = y.getFullYear();
  const month = String(y.getMonth() + 1).padStart(2, '0');
  const day = String(y.getDate()).padStart(2, '0');
  const datas = {
    todayPage,
    // yesterdayPage: dv.page(`Journal/${year}-${month}-${day}.md`), 
  }
  // datas.content = await dv.io.load(todayPage.file.path);
  // TrackerStats.init(datas)
</script>

<div>
  Coucou
</div>

<style>
  
</style>