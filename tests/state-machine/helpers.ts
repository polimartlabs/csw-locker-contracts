export const prettyConsoleLog = (...items: (string | undefined)[]) => {
  // Ensure we only render up to the first 10 items for brevity.
  const renderItems = items.slice(0, 10);
  const columnWidth = 35; // Standard width for each column after the first two.
  const halfColumns = Math.floor(columnWidth / 2);

  // Pad columns to their widths: half for the first three, full for the rest.
  const prettyPrint = renderItems.map((content, index) =>
    // Check if the index is less than 3 (i.e., first three items).
    content
      ? index < 2
        ? content.padEnd(halfColumns + 2)
        : content.padEnd(columnWidth)
      : index < 2
      ? "".padEnd(halfColumns)
      : "".padEnd(columnWidth)
  );

  process.stdout.write(`${prettyPrint.join(" ")}\n`);
};
