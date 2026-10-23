// Operate the same visible controls the teacher uses; there are no numeric inputs.
async function wheelValue(page,field,value){const host=page.locator('[data-exercise-wheel="'+field+'"]');await host.focus();await page.keyboard.press('Home');const steps=value-(field==='count'?3:5);for(let i=0;i<steps;i++)await page.keyboard.press('ArrowDown');await page.waitForFunction(({field,value})=>document.querySelector('[data-exercise-wheel="'+field+'"]')?.dataset.wheelValue===String(value),{field,value});}
async function curriculum(page,value){const details=page.locator('.exercise-custom-range');if(await details.getAttribute('open')===null)await details.locator('summary').click();await page.locator('[data-ai-field=curriculum]').fill(value);}
async function formatOptions(page){const panel=page.locator('[data-render-key=more-settings]');if(await panel.getAttribute('open')===null)await panel.locator('summary').first().click();}
module.exports={wheelValue,curriculum,formatOptions};
