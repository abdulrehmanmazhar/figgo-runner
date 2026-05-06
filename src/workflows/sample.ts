import type { Workflow } from "../types.js";

export const sampleWorkflow: Workflow = {
  id: "sample",
  description: "Example workflow: two echo steps and a failing step to test resume",
  steps: [
    {
      id: "step1",
      description: "Print step 1",
      run: 'echo "Running step 1"',
    },
    {
      id: "step2",
      description: "Print step 2",
      run: 'echo "Running step 2"',
    },
    {
      id: "step3",
      description: "Intentionally fail to demonstrate resume",
      run: 'echo "Running step 3 (will fail)" && exit 1',
    },
  ],
};
