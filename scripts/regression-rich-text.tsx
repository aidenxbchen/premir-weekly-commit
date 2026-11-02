import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownContent, safeLink } from '../client/src/components/MarkdownContent';
import { splitCriteria, encodeCriteria } from '../shared/criteria-text';
import { isChecklistComplete } from '../server/common/utils/criteria.util';

function render(text: string): string {
  return renderToStaticMarkup(<MarkdownContent text={text} renderLink={(href, label) => <a href={href}>{label}</a>} />);
}

const text = '**重点**与*说明*\n\n- 样机\n- 报告\n\n1. 测试\n2. 验证\n\n[测试报告](https://example.com/report)\nhttps://example.com/raw';
const html = render(text);
assert.match(html, /<strong>重点<\/strong>/);
assert.match(html, /<em>说明<\/em>/);
assert.match(html, /<ul>/);
assert.match(html, /<ol start="1">/);
assert.match(html, /href="https:\/\/example.com\/report"/);
assert.match(html, /href="https:\/\/example.com\/raw"/);
assert.match(render('第一行\n第二行'), /第一行.*<br\/>.*第二行/);
assert.match(render('交付报告：https://example.com/report，请查阅'), /href="https:\/\/example.com\/report"/);
assert.doesNotMatch(render('见 https://example.com/report。'), /href="[^"]*。/);
assert.match(render('[中文路径](https://example.com/报告，附件)'), /href="https:\/\/example.com\/报告，附件"/);
assert.doesNotMatch(render('[恶意链接](javascript:alert%281%29)'), /href="javascript:/i);
assert.doesNotMatch(render('<img src=x onerror=alert(1)>'), /<img|<[^>]*\sonerror=/i);
assert.doesNotMatch(render('<script>alert(1)</script>'), /<script/i);
assert.equal(safeLink('data:text/html,hello'), false);
assert.equal(safeLink('//untrusted.example.com'), false);

// 历史记录的条目数和勾选不变；新条目里的数字、网址、嵌套列表仍只算同一验收项。
const old = '1.完成样机 2.提交报告';
assert.deepEqual(splitCriteria(old), ['1.完成样机', '2.提交报告']);
assert.equal(isChecklistComplete(old, '✅,❌'), true);
const items = ['**测试报告**\n1. 首轮\n2. 复测\nhttps://example.com/v2.1', '误差小于 0.5，频率 2.4GHz'];
const saved = encodeCriteria(items);
assert.deepEqual(splitCriteria(saved), items);
assert.equal(isChecklistComplete(saved, '✅'), false);
assert.equal(isChecklistComplete(saved, '✅,⏹️'), true);
assert.deepEqual(splitCriteria(encodeCriteria([items[0]])), [items[0]]);
assert.deepEqual(splitCriteria(encodeCriteria([])), []);
console.log('PASS: rich-text formatting, automatic links, safe rendering, legacy criteria and grading counts');
