<script lang="ts">
  let { start = 0 }: { start?: number } = $props();
  let count = $state(start);
</script>

<button id="counter" type="button" onclick={() => count++}>{count}</button>
